import crypto from "node:crypto";
import { createPolicyResolver } from "../policy/policy-resolver.service.js";
import { isEffectiveAt } from "../policy/policy-effective.js";
import { planAssignmentTransitions, type AssignmentSnapshot } from "../policy/policy-assignment-transition.js";
import type { HttpError } from "../../utils/api-error.js";
import type { SandboxAudit, SerializedAssignment, WarpDemoSandbox, WarpDemoSessionStore } from "./warp-demo-session.store.js";

const hydratedAssignments = (items: SerializedAssignment[]): AssignmentSnapshot[] => items.map((item) => ({ ...item, effectiveFrom: new Date(item.effectiveFrom), effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null, resolvedAt: new Date(item.resolvedAt) }));
const serializedAssignments = (items: AssignmentSnapshot[]): SerializedAssignment[] => items.map((item) => ({ ...item, effectiveFrom: item.effectiveFrom.toISOString(), effectiveTo: item.effectiveTo?.toISOString() ?? null, resolvedAt: item.resolvedAt.toISOString() }));
const effective = (item: { effectiveFrom: string | null; effectiveTo: string | null }, date: Date) => isEffectiveAt(item.effectiveFrom ? new Date(item.effectiveFrom) : null, item.effectiveTo ? new Date(item.effectiveTo) : null, date);

export const createWarpDemoSandboxEngine = ({ store, createHttpError }: { store: WarpDemoSessionStore; createHttpError: (message: string, statusCode: number) => HttpError }) => {
  const resolverFor = (sandbox: WarpDemoSandbox) => createPolicyResolver({
    employeeRepository: { findByIdAndBusiness: async (employeeId: string, businessId: string) => employeeId === sandbox.employee.id && businessId === sandbox.seed.businessId ? { ...sandbox.employee, employmentStartDate: sandbox.employee.employmentStartDate ? new Date(sandbox.employee.employmentStartDate) : null } : null } as any,
    policyRepository: {
      findEffectiveRules: async (businessId: string, asOf: Date) => sandbox.seed.rules.filter((item) => businessId === sandbox.seed.businessId && item.status === "active" && effective(item, asOf)),
      findAssignmentsAsOf: async (_businessId: string, employeeId: string, asOf: Date) => hydratedAssignments(sandbox.assignments).filter((item) => employeeId === sandbox.employee.id && item.effectiveFrom <= asOf && (!item.effectiveTo || item.effectiveTo > asOf)),
      findEffectivePolicies: async (_businessId: string, policyIds: string[], asOf: Date) => sandbox.seed.policies.filter((item) => policyIds.includes(item.id) && item.status === "active" && effective(item, asOf)),
      findCategory: async (_businessId: string, categoryId: string) => sandbox.seed.categories.find((item) => item.id === categoryId) ?? null,
    } as any,
    employeeListRepository: {
      findEmployeeListByBusinessAndId: async (_businessId: string, id: string) => sandbox.seed.departments.find((item) => item.id === id) ?? null,
      findEmployeeListsByBusinessAndIds: async (_businessId: string, ids: string[]) => sandbox.seed.departments.filter((item) => ids.includes(item.id)),
    } as any,
    employeeTypeRepository: {
      findActiveByBusinessAndId: async (_businessId: string, id: string) => sandbox.seed.employeeTypes.find((item) => item.id === id && item.status === "active") ?? null,
      findByBusinessAndIds: async (_businessId: string, ids: string[]) => sandbox.seed.employeeTypes.filter((item) => ids.includes(item.id)),
    } as any,
    employeeGroupRepository: {
      findActiveByBusinessAndIds: async (_businessId: string, ids: string[]) => sandbox.seed.groups.filter((item) => ids.includes(item.id) && item.status === "active"),
      findByBusinessAndIds: async (_businessId: string, ids: string[]) => sandbox.seed.groups.filter((item) => ids.includes(item.id)),
    } as any,
    createHttpError,
  });

  const resolve = async (sandbox: WarpDemoSandbox, asOfDate = new Date()) => resolverFor(sandbox).resolvePoliciesForEmployee({ businessId: sandbox.seed.businessId, employeeId: sandbox.employee.id, asOfDate });

  const reconcile = async ({ sessionId, runId, revision, reason, employeeChanged, asOfDate = new Date() }: { sessionId: string; runId: string; revision: number; reason: string; employeeChanged: boolean; asOfDate?: Date }) => {
    const sandbox = await store.getSession(sessionId);
    if (sandbox.revision !== revision || sandbox.activeRunId !== runId) return { stale: true as const };
    const resolution = await resolve(sandbox, asOfDate);
    const all = hydratedAssignments(sandbox.assignments);
    const current = all.filter((item) => item.effectiveFrom <= asOfDate && (!item.effectiveTo || item.effectiveTo > asOfDate));
    const transitions = planAssignmentTransitions({ current, desired: resolution.desiredPolicies, asOfDate });
    const byId = new Map(all.map((item) => [item.id, item]));
    const audits: SandboxAudit[] = [...sandbox.audit];
    if (employeeChanged) audits.push({ id: crypto.randomUUID(), occurredAt: asOfDate.toISOString(), employeeId: sandbox.employee.id, action: "EMPLOYEE_UPDATED", entityType: "employee", actorType: "demo", reason, correlationId: runId });
    for (const transition of transitions) {
      if (transition.operation === "KEEP") continue;
      if (transition.operation === "END" || transition.operation === "UPDATE_VERSION") byId.set(transition.ended.id, transition.ended);
      if (transition.operation === "CREATE" || transition.operation === "UPDATE_VERSION") byId.set(transition.assignment.id, transition.assignment);
      audits.push({ id: crypto.randomUUID(), occurredAt: asOfDate.toISOString(), employeeId: sandbox.employee.id, policyId: transition.policyId, categoryId: transition.operation === "END" ? transition.ended.categoryId : transition.assignment.categoryId, action: transition.operation === "CREATE" ? "ASSIGNMENT_CREATED" : transition.operation === "END" ? "ASSIGNMENT_ENDED" : "ASSIGNMENT_VERSION_UPDATED", entityType: "employee_policy_assignment", actorType: "worker", reason, correlationId: runId });
    }
    const assignments = serializedAssignments([...byId.values()]);
    await store.commitRun({ sessionId, runId, revision, assignments, audit: audits });
    return { stale: false as const, resolution, changes: transitions.map((item) => ({ operation: item.operation, policyId: item.policyId })), assignments };
  };
  return { reconcile, resolve };
};

export type WarpDemoSandboxEngine = ReturnType<typeof createWarpDemoSandboxEngine>;
