import crypto from "node:crypto";
import type { HttpError } from "../../utils/api-error.js";
import type { PolicyReconciliationJob } from "../../queues/policy-reconciliation.types.js";
import type { PolicyResolver } from "../policy/policy-resolver.service.js";
import type { WarpDemoRepository } from "./warp-demo.repository.js";
import type { WarpDemoProgressService } from "./warp-demo-progress.service.js";
import type { WarpDemoSandboxEngine } from "./warp-demo-sandbox.engine.js";
import type { WarpDemoMutation } from "./warp-demo.validators.js";
import { WarpDemoBusyError, WarpDemoMutationLimitError, WarpDemoRunConflictError, WarpDemoSessionExpiredError, WarpDemoStaleRunError, type SandboxEmployee, type WarpDemoSandbox, type WarpDemoSessionStore } from "./warp-demo-session.store.js";
import { createWarpDemoSeedService } from "./warp-demo.seed.service.js";
import { createWarpDemoReadService } from "./warp-demo.read.service.js";
import { explanation, mapPolicies, sandboxEmployeeDto } from "./warp-demo.dto.js";

type Dependencies = {
  repository: WarpDemoRepository;
  resolver: PolicyResolver;
  businessId?: string;
  createHttpError: (message: string, statusCode: number) => HttpError;
  sessionStore: WarpDemoSessionStore;
  sandboxEngine: WarpDemoSandboxEngine;
  progressService: WarpDemoProgressService;
  enqueueReconciliation: (job: PolicyReconciliationJob) => Promise<unknown>;
};

export const createWarpDemoService = (dependencies: Dependencies) => {
  const { repository, resolver, businessId, createHttpError, sessionStore, sandboxEngine, progressService, enqueueReconciliation } = dependencies;
  const seedService = createWarpDemoSeedService({ repository, businessId, createHttpError });
  const readService = createWarpDemoReadService({ repository, resolver, seedService, businessId, createHttpError });
  const publicSessionError = (error: unknown): never => {
    if (error instanceof WarpDemoSessionExpiredError) throw createHttpError(error.message, 410);
    if (error instanceof WarpDemoRunConflictError || error instanceof WarpDemoStaleRunError) throw createHttpError(error.message, 409);
    if (error instanceof WarpDemoMutationLimitError) throw createHttpError(error.message, 429);
    if (error instanceof WarpDemoBusyError) throw createHttpError(error.message, 423);
    throw error;
  };
  const queueChange = async ({ sandbox, employee, description, reason, countMutation, supersede = false }: { sandbox: WarpDemoSandbox; employee: SandboxEmployee; description: string; reason: string; countMutation: boolean; supersede?: boolean }) => {
    const runId = crypto.randomUUID();
    const employeeChanged = JSON.stringify(sandbox.employee) !== JSON.stringify(employee);
    let revision: number;
    try { revision = await sessionStore.beginRun({ sessionId: sandbox.id, runId, expectedRevision: sandbox.revision, employee, countMutation, supersede }); } catch (error) { return publicSessionError(error); }
    try {
      await progressService.createRun({ runId, sessionId: sandbox.id });
      await progressService.appendEvent(runId, { stage: "employee_update", status: "success", title: employeeChanged ? "Employee updated" : "Employee already at requested state", description: employeeChanged ? description : "The employee facts already matched the requested demo state." }, "employee-updated");
      await progressService.appendEvent(runId, { stage: "queued", status: "pending", title: "Reconciliation queued", description: "The real Aurex policy engine will reconcile this session sandbox." }, "queued");
      const queued = await enqueueReconciliation({ type: "RECONCILE_WARP_DEMO", sessionId: sandbox.id, runId, revision, employeeChanged, reason: `warp_demo.${reason}`, requestedAt: new Date().toISOString(), correlationId: runId });
      if (!queued) throw new Error("Demo reconciliation queue is unavailable");
      return { runId, status: "queued" as const };
    } catch {
      await progressService.markFailed(runId).catch(() => undefined);
      await sessionStore.finishRun(sandbox.id, runId).catch(() => undefined);
      throw createHttpError("Reconciliation could not be started. Reset the scenario and try again.", 503);
    }
  };
  const createSession = async () => {
    let sandbox: WarpDemoSandbox;
    try { sandbox = await sessionStore.createSession(await seedService.loadSeed()); } catch (error) { return publicSessionError(error); }
    const initialization = await queueChange({ sandbox, employee: sandbox.baselineEmployee, description: "Maya Patel was initialized from the canonical demo seed.", reason: "session_initialized", countMutation: false });
    return { sessionId: sandbox.id, expiresAt: sandbox.expiresAt, employee: sandboxEmployeeDto(sandbox.employee, sandbox.seed), initialization, controls: { department: ["engineering", "finance"], employeeType: ["full_time", "contractor"], state: ["california", "new_york"], remoteGroup: ["member", "not_member"] } };
  };
  const mutate = async (sessionId: string, mutation: WarpDemoMutation) => {
    let sandbox: WarpDemoSandbox;
    try { sandbox = await sessionStore.getSession(sessionId); } catch (error) { return publicSessionError(error); }
    const employee = { ...sandbox.employee, groupIds: [...sandbox.employee.groupIds] };
    const before = sandboxEmployeeDto(employee, sandbox.seed);
    let description: string;
    if (mutation.field === "department") { const name = mutation.value === "engineering" ? "Engineering" : "Finance"; employee.employeeListId = sandbox.seed.departments.find((item) => item.name === name)!.id; description = `Department changed from ${before.department} to ${name}.`; }
    else if (mutation.field === "employeeType") { const name = mutation.value === "full_time" ? "Full Time" : "Contractor"; employee.employeeTypeId = sandbox.seed.employeeTypes.find((item) => item.name === name)!.id; description = `Employee type changed from ${before.employeeType} to ${name}.`; }
    else if (mutation.field === "state") { const name = mutation.value === "california" ? "California" : "New York"; employee.state = name; description = `State changed from ${before.state} to ${name}.`; }
    else { const remote = sandbox.seed.groups.find((item) => item.name === "Remote")!.id; employee.groupIds = employee.groupIds.filter((item) => item !== remote); if (mutation.value === "member") employee.groupIds.push(remote); description = mutation.value === "member" ? "Maya Patel joined the Remote group." : "Maya Patel left the Remote group."; }
    return queueChange({ sandbox, employee, description, reason: `${mutation.field}_changed`, countMutation: true });
  };
  const reset = async (sessionId: string) => {
    let sandbox: WarpDemoSandbox;
    try { sandbox = await sessionStore.getSession(sessionId); } catch (error) { return publicSessionError(error); }
    const run = await queueChange({ sandbox, employee: sandbox.baselineEmployee, description: "Maya Patel was reset to the canonical demo baseline.", reason: "reset", countMutation: true, supersede: true });
    return { ...run, employee: sandboxEmployeeDto(sandbox.baselineEmployee, sandbox.seed) };
  };
  const sessionEmployee = async (sessionId: string) => { try { const sandbox = await sessionStore.getSession(sessionId); return sandboxEmployeeDto(sandbox.employee, sandbox.seed); } catch (error) { return publicSessionError(error); } };
  const sessionEmployeePolicies = async (sessionId: string) => { let sandbox: WarpDemoSandbox; try { sandbox = await sessionStore.getSession(sessionId); } catch (error) { return publicSessionError(error); } return mapPolicies(sandboxEmployeeDto(sandbox.employee, sandbox.seed), sandbox.assignments.filter((item) => item.status === "active"), sandbox.seed.policies, sandbox.seed.categories, sandbox.seed.rules); };
  const sessionExplain = async (sessionId: string) => { let sandbox: WarpDemoSandbox; try { sandbox = await sessionStore.getSession(sessionId); } catch (error) { return publicSessionError(error); } return explanation(sandboxEmployeeDto(sandbox.employee, sandbox.seed), await sandboxEngine.resolve(sandbox), sandbox.seed.policies, sandbox.seed.categories); };
  const sessionAudit = async (sessionId: string) => { try { const sandbox = await sessionStore.getSession(sessionId); const names = new Map(sandbox.seed.policies.map((item) => [item.id, item.name])); return { events: [...sandbox.audit].reverse().map((event) => ({ id: event.id, timestamp: event.occurredAt, entityType: event.entityType, action: event.action, actor: { type: event.actorType, displayName: event.actorType === "demo" ? "Demo reviewer" : "Aurex policy engine" }, policyName: event.policyId ? names.get(event.policyId) : undefined, summary: [event.action.replaceAll("_", " ").toLowerCase(), event.policyId ? names.get(event.policyId) : null, `for ${sandbox.employee.fullName}`].filter(Boolean).join(" "), ...(event.reason ? { reason: event.reason } : {}) })) }; } catch (error) { return publicSessionError(error); } };
  const reconciliationRun = async (sessionId: string, runId: string) => { try { await sessionStore.getSession(sessionId); } catch (error) { return publicSessionError(error); } const run = await progressService.getRun(sessionId, runId); if (!run) throw createHttpError("Reconciliation run not found.", 404); return run; };
  return { ...readService, createSession, mutate, reset, sessionEmployee, sessionEmployeePolicies, sessionExplain, sessionAudit, reconciliationRun };
};

export type WarpDemoService = ReturnType<typeof createWarpDemoService>;
