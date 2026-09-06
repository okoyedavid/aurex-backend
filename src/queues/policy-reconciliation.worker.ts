import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { businessRepository } from "../modules/business/business.repository.js";
import { employeeRepository } from "../modules/employee/employee.repository.js";
import { policyRepository } from "../modules/policy/policy.repository.js";
import { policyReconciliationService } from "../modules/policy/policy.module.js";
import {
  externalAccessReconciliationService,
  githubIntegrationRepository,
} from "../modules/github-integration/github-integration.module.js";
import {
  enqueuePolicyReconciliation,
  POLICY_RECONCILIATION_QUEUE,
} from "./policy-reconciliation.queue.js";
import type { PolicyReconciliationJob } from "./policy-reconciliation.types.js";
import { warpDemoProgressService, warpDemoSessionStore } from "../modules/warp-demo/warp-demo.module.js";

let worker: Worker<PolicyReconciliationJob> | null = null;
let workerConnection: Redis | null = null;

const enqueueEmployeesForBusiness = async (
  job: Job<PolicyReconciliationJob>,
  businessId: string,
  reason: string,
) => {
  let afterId: string | null = null;
  let processed = 0;
  do {
    const employees =
      await employeeRepository.findActiveEmployeesBatchByBusiness(
        businessId,
        afterId,
        env.POLICY_RECONCILIATION_BATCH_SIZE,
      );
    for (const employee of employees) {
      await enqueuePolicyReconciliation({
        type: "RECONCILE_EMPLOYEE",
        businessId,
        employeeId: employee.id,
        reason,
        requestedBy: job.data.requestedBy,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    }
    processed += employees.length;
    afterId =
      employees.length === env.POLICY_RECONCILIATION_BATCH_SIZE
        ? employees.at(-1)!.id
        : null;
  } while (afterId);
  return processed;
};

const processJob = async (job: Job<PolicyReconciliationJob>) => {
  const startedAt = Date.now();
  console.info("Policy reconciliation job started", {
    jobId: job.id,
    type: job.data.type,
    businessId: "businessId" in job.data ? job.data.businessId : undefined,
  });
  if (job.data.type === "RECONCILE_EMPLOYEE") {
    const demoRun = job.data.demoRun;
    if (demoRun) {
      await warpDemoProgressService.markRunning(demoRun.runId);
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "policy_resolution", status: "running", title: "Policies recalculating", description: "Aurex is evaluating the employee against the seeded policy rules." }, "policy-running");
    }
    const policyResult = await policyReconciliationService.reconcileEmployeePolicies({
      businessId: job.data.businessId,
      employeeId: job.data.employeeId,
      asOfDate: new Date(),
      reason: job.data.reason,
      actor: { actorType: "worker" },
      correlationId: job.data.correlationId,
      triggeredByUserId: job.data.requestedBy,
    });
    if (demoRun) {
      const evaluated = policyResult.resolution.evaluatedRules.length;
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "policy_resolution", status: "success", title: "Policies recalculated", description: `${evaluated} active ${evaluated === 1 ? "rule was" : "rules were"} evaluated for this employee.` }, "policy-complete");
      const created = policyResult.changes.filter((change) => change.operation === "CREATE" || change.operation === "UPDATE_VERSION").length;
      const ended = policyResult.changes.filter((change) => change.operation === "END" || change.operation === "UPDATE_VERSION").length;
      const kept = policyResult.changes.filter((change) => change.operation === "KEEP").length;
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "assignment_reconciliation", status: "success", title: "Policy assignments reconciled", description: `${created} ${created === 1 ? "assignment" : "assignments"} became effective, ${ended} ended, and ${kept} remained unchanged.` }, "assignments-complete");
    }
    const grants =
      await externalAccessReconciliationService.syncEmployeeDesiredAccess(
        job.data.businessId,
        job.data.employeeId,
      );
    if (demoRun) {
      const warning = grants.length > 0;
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "external_access", status: warning ? "warning" : "success", title: "External access synchronized", description: warning ? `${grants.length} desired external access ${grants.length === 1 ? "record was" : "records were"} synchronized. Privileged GitHub execution is disabled for the public demo.` : "No external access changes were required. No privileged GitHub actions were executed." }, "external-complete");
      const assignmentsChanged = policyResult.changes.some((change) => change.operation !== "KEEP");
      const auditChanged = demoRun.employeeChanged || assignmentsChanged;
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "audit", status: "success", title: auditChanged ? "Audit evidence recorded" : "Audit state checked", description: auditChanged ? "The employee and assignment changes were recorded through Aurex's normal audit paths." : "No employee or assignment change required a new audit record." }, "audit-complete");
      await warpDemoProgressService.appendEvent(demoRun.runId, { stage: "complete", status: warning ? "warning" : "success", title: "Reconciliation complete", description: "The persisted employee and policy assignment state is ready to refresh." }, "run-complete");
      await warpDemoProgressService.markCompleted(demoRun.runId, [...(demoRun.employeeChanged ? ["employee"] : []), ...(assignmentsChanged ? ["assignments"] : []), ...(auditChanged ? ["audit"] : []), ...(grants.length ? ["externalAccess"] : [])], warning);
      await warpDemoSessionStore.finishRun(demoRun.sessionId, demoRun.runId);
      return { employeesProcessed: 1, demoRunId: demoRun.runId };
    }
    for (const grant of grants)
      await enqueuePolicyReconciliation({
        type: "ENFORCE_EXTERNAL_ACCESS",
        businessId: job.data.businessId,
        grantId: grant.id,
        desiredRevision: grant.desiredRevision,
        reason: job.data.reason,
        requestedBy: job.data.requestedBy,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    return { employeesProcessed: 1 };
  }
  if (job.data.type === "RECONCILE_EXTERNAL_EMPLOYEE") {
    const grants =
      await externalAccessReconciliationService.syncEmployeeDesiredAccess(
        job.data.businessId,
        job.data.employeeId,
      );
    for (const grant of grants)
      await enqueuePolicyReconciliation({
        type: "ENFORCE_EXTERNAL_ACCESS",
        businessId: job.data.businessId,
        grantId: grant.id,
        desiredRevision: grant.desiredRevision,
        reason: job.data.reason,
        requestedBy: job.data.requestedBy,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    return { grantsProcessed: grants.length };
  }
  if (job.data.type === "ENFORCE_EXTERNAL_ACCESS") {
    return externalAccessReconciliationService.enforceGrant(
      job.data.businessId,
      job.data.grantId,
      job.data.desiredRevision,
    );
  }
  if (job.data.type === "RECONCILE_EXTERNAL_DRIFT") {
    let afterId: string | null = null;
    let grantsProcessed = 0;
    do {
      const grants = await githubIntegrationRepository.listManagedGrantsBatch(
        job.data.businessId,
        afterId,
        env.POLICY_RECONCILIATION_BATCH_SIZE,
      );
      for (const grant of grants)
        await enqueuePolicyReconciliation({
          type: "ENFORCE_EXTERNAL_ACCESS",
          businessId: job.data.businessId,
          grantId: grant.id,
          desiredRevision: grant.desiredRevision,
          reason: job.data.reason,
          requestedBy: job.data.requestedBy,
          requestedAt: new Date().toISOString(),
          correlationId: job.data.correlationId,
        });
      grantsProcessed += grants.length;
      afterId =
        grants.length === env.POLICY_RECONCILIATION_BATCH_SIZE
          ? grants.at(-1)!.id
          : null;
    } while (afterId);
    return { grantsProcessed };
  }
  if (job.data.type === "RECONCILE_POLICY") {
    const current = await policyRepository.findPolicy(
      job.data.businessId,
      job.data.policyId,
    );
    if (current && current.version !== job.data.policyVersion)
      console.info("Policy reconciliation job observed newer policy version", {
        jobId: job.id,
        policyId: job.data.policyId,
        queuedVersion: job.data.policyVersion,
        currentVersion: current.version,
      });
    return {
      employeesProcessed: await enqueueEmployeesForBusiness(
        job,
        job.data.businessId,
        job.data.reason,
      ),
    };
  }
  if (
    job.data.type === "RECONCILE_CATEGORY" ||
    job.data.type === "RECONCILE_BUSINESS"
  ) {
    return {
      employeesProcessed: await enqueueEmployeesForBusiness(
        job,
        job.data.businessId,
        job.data.reason,
      ),
    };
  }

  let afterId: string | null = null;
  let businessesProcessed = 0;
  do {
    const businesses = await businessRepository.findActiveBusinessesBatch(
      afterId,
      env.POLICY_RECONCILIATION_BATCH_SIZE,
    );
    for (const business of businesses) {
      await enqueuePolicyReconciliation({
        type: "RECONCILE_BUSINESS",
        businessId: business.id,
        reason: "nightly_safety_reconciliation",
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
      await enqueuePolicyReconciliation({
        type: "RECONCILE_EXTERNAL_DRIFT",
        businessId: business.id,
        reason: "nightly_external_access_verification",
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    }
    businessesProcessed += businesses.length;
    afterId =
      businesses.length === env.POLICY_RECONCILIATION_BATCH_SIZE
        ? businesses.at(-1)!.id
        : null;
  } while (afterId);
  console.info("Policy reconciliation job completed", {
    jobId: job.id,
    type: job.data.type,
    businessesProcessed,
    durationMs: Date.now() - startedAt,
  });
  return { businessesProcessed };
};

export const startPolicyReconciliationWorker = () => {
  if (worker || !env.REDIS_URL) return worker;
  workerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  workerConnection.on("error", (error) =>
    console.error("Policy worker Redis connection error", {
      error: error.message,
    }),
  );
  worker = new Worker<PolicyReconciliationJob>(
    POLICY_RECONCILIATION_QUEUE,
    processJob,
    {
      connection: workerConnection,
      concurrency: env.POLICY_RECONCILIATION_CONCURRENCY,
    },
  );
  worker.on("completed", (job, result) =>
    console.info("Policy reconciliation job completed", {
      jobId: job.id,
      type: job.data.type,
      ...result,
    }),
  );
  worker.on("failed", (job, error) =>
    {
      console.error("Policy reconciliation job failed", {
      jobId: job?.id,
      type: job?.data.type,
      attemptsMade: job?.attemptsMade,
      error: error.message,
      });
      const demoRun = job?.data.demoRun;
      const attempts = job?.opts.attempts ?? 1;
      if (demoRun && (job?.attemptsMade ?? 0) >= attempts) {
        void warpDemoProgressService.appendEvent(demoRun.runId, { stage: "complete", status: "failed", title: "Reconciliation could not be completed", description: "Reset the demo scenario and try again." }, "run-failed")
          .then(() => warpDemoProgressService.markFailed(demoRun.runId))
          .then(() => warpDemoSessionStore.finishRun(demoRun.sessionId, demoRun.runId))
          .catch((progressError) => console.error("Failed to record terminal Warp demo progress", { runId: demoRun.runId, error: progressError instanceof Error ? progressError.message : "unknown" }));
      }
    },
  );
  return worker;
};

export const stopPolicyReconciliationWorker = async () => {
  await worker?.close();
  worker = null;
  if (workerConnection) await workerConnection.quit();
  workerConnection = null;
};
