import type { Job } from "bullmq";
import type { PolicyReconciliationJob } from "./policy-reconciliation.types.js";
import type { WarpDemoProgressService } from "../modules/warp-demo/warp-demo-progress.service.js";
import type { WarpDemoSandboxEngine } from "../modules/warp-demo/warp-demo-sandbox.engine.js";
import type { WarpDemoSessionStore } from "../modules/warp-demo/warp-demo-session.store.js";

type Dependencies = {
  sessionStore: WarpDemoSessionStore;
  progressService: WarpDemoProgressService;
  sandboxEngine: WarpDemoSandboxEngine;
};

export const processWarpDemoReconciliation = async (
  job: Job<PolicyReconciliationJob>,
  { sessionStore, progressService, sandboxEngine }: Dependencies,
) => {
  if (job.data.type !== "RECONCILE_WARP_DEMO") return null;
  const demoRun = job.data;
  const sandbox = await sessionStore.getSession(demoRun.sessionId);
  if (sandbox.revision !== demoRun.revision || sandbox.activeRunId !== demoRun.runId) {
    return { employeesProcessed: 0, staleDemoRun: true };
  }
  await progressService.markRunning(demoRun.runId);
  await progressService.appendEvent(demoRun.runId, {
    stage: "policy_resolution",
    status: "running",
    title: "Policies recalculating",
    description: "Aurex is evaluating the employee against the seeded policy rules.",
  }, "policy-running");
  const policyResult = await sandboxEngine.reconcile({
    sessionId: demoRun.sessionId,
    runId: demoRun.runId,
    revision: demoRun.revision,
    reason: job.data.reason,
    employeeChanged: demoRun.employeeChanged,
    asOfDate: new Date(),
  });
  if (policyResult.stale) return { employeesProcessed: 0, staleDemoRun: true };
  const evaluated = policyResult.resolution.evaluatedRules.length;
  await progressService.appendEvent(demoRun.runId, {
    stage: "policy_resolution",
    status: "success",
    title: "Policies recalculated",
    description: `${evaluated} active ${evaluated === 1 ? "rule was" : "rules were"} evaluated for this employee.`,
  }, "policy-complete");
  const created = policyResult.changes.filter((change) => change.operation === "CREATE" || change.operation === "UPDATE_VERSION").length;
  const ended = policyResult.changes.filter((change) => change.operation === "END" || change.operation === "UPDATE_VERSION").length;
  const kept = policyResult.changes.filter((change) => change.operation === "KEEP").length;
  const assignmentsChanged = policyResult.changes.some((change) => change.operation !== "KEEP");
  await progressService.appendEvent(demoRun.runId, {
    stage: "assignment_reconciliation", status: "success", title: "Policy assignments reconciled",
    description: `${created} ${created === 1 ? "assignment" : "assignments"} became effective, ${ended} ended, and ${kept} remained unchanged.`,
  }, "assignments-complete");
  await progressService.appendEvent(demoRun.runId, {
    stage: "external_access", status: "success", title: "External access simulated",
    description: "No production external-access grant or privileged GitHub action was created.",
  }, "external-complete");
  const auditChanged = demoRun.employeeChanged || assignmentsChanged;
  await progressService.appendEvent(demoRun.runId, {
    stage: "audit", status: "success", title: auditChanged ? "Audit evidence recorded" : "Audit state checked",
    description: auditChanged ? "Session-local employee and assignment changes were recorded." : "No employee or assignment change required a new audit record.",
  }, "audit-complete");
  await progressService.appendEvent(demoRun.runId, {
    stage: "complete", status: "success", title: "Reconciliation complete",
    description: "The session's employee and policy assignment state is ready to refresh.",
  }, "run-complete");
  await progressService.markCompleted(demoRun.runId, [
    ...(demoRun.employeeChanged ? ["employee"] : []),
    ...(assignmentsChanged ? ["assignments"] : []),
    ...(auditChanged ? ["audit"] : []),
  ]);
  return { employeesProcessed: 1, demoRunId: demoRun.runId };
};
