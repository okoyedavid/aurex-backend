import { describe, expect, it, vi } from "vitest";
import { createPolicyReconciliationService } from "./policy-reconciliation.service.js";

const assignment = (value: Record<string, unknown>) => ({
  policyVersion: 1,
  winningRuleId: null,
  matchedRuleIds: [],
  status: "active",
  source: "rule",
  ...value,
  toObject() { return { ...this }; },
});

describe("policy reconciliation", () => {
  it("creates, ends and then idempotently keeps assignments", async () => {
    let current = [assignment({ id: "a-old", policyId: "p-old", categoryId: "c1" })];
    let sequence = 0;
    const audits: unknown[] = [];
    const repository = {
      findAssignmentsAsOf: async () => current.filter((item) => item.status === "active"),
      createAssignment: async (payload: Record<string, unknown>) => {
        const created = assignment({ ...payload, id: `a-${++sequence}` });
        current.push(created);
        return created;
      },
      updateAssignment: async (assignmentId: string, update: { $set: Record<string, unknown> }) => {
        const item = current.find((candidate) => candidate.id === assignmentId);
        if (!item) return null;
        Object.assign(item, update.$set);
        return item;
      },
    };
    const desired = { policyId: "p-new", categoryId: "c1", policyVersion: 1, source: "rule" as const, priority: 10, winningRuleId: "r1", matchedRuleIds: ["r1"], conditionEvaluations: {}, manualAssignmentId: null };
    const service = createPolicyReconciliationService({
      repository: repository as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [desired], suppressedCandidates: [], employeeId: "e1", businessId: "b1", evaluationDate: new Date(), intervalSemantics: "" }) } as never,
      auditService: { record: async (payload: unknown) => audits.push(payload) } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });

    const first = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "test", actor: { actorType: "worker" } });
    expect(first.changes.map((item) => item.operation).sort()).toEqual(["CREATE", "END"]);
    expect(audits).toHaveLength(2);

    const second = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "test", actor: { actorType: "worker" } });
    expect(second.changes).toEqual([{ operation: "KEEP", policyId: "p-new", assignmentId: "a-1" }]);
    expect(audits).toHaveLength(2);
  });

  it("does not mutate a valid desired manual assignment", async () => {
    const manual = assignment({ id: "manual-1", policyId: "p1", categoryId: "c1", source: "manual" });
    const updateAssignment = vi.fn();
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: async () => [manual], updateAssignment } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 1, source: "manual", priority: null, winningRuleId: null, matchedRuleIds: [], conditionEvaluations: {}, manualAssignmentId: "manual-1" }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    const result = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "test", actor: { actorType: "worker" } });
    expect(result.changes[0]?.operation).toBe("KEEP");
    expect(updateAssignment).not.toHaveBeenCalled();
  });
});
