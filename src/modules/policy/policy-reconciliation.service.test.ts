import { describe, expect, it, vi } from "vitest";
import { createPolicyReconciliationService } from "./policy-reconciliation.service.js";

const assignment = (value: Record<string, unknown>) => ({
  policyVersion: 1,
  winningRuleId: null,
  matchedRuleIds: [],
  status: "active",
  source: "rule",
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveTo: null,
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

  it("ends the old snapshot and starts a replacement when the policy version changes", async () => {
    const current = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r1", matchedRuleIds: ["r1"] });
    const history = [current];
    const audits: Array<Record<string, unknown>> = [];
    const transitionAt = new Date("2026-09-04T00:00:00.000Z");
    const service = createPolicyReconciliationService({
      repository: {
        findAssignmentsAsOf: async () => [current],
        updateAssignment: async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set),
        createAssignment: async (payload: Record<string, unknown>) => {
          const created = assignment({ ...payload, id: "a2" });
          history.push(created);
          return created;
        },
      } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 2, source: "rule", priority: 10, winningRuleId: "r1", matchedRuleIds: ["r1"], conditionEvaluations: {}, manualAssignmentId: null }], suppressedCandidates: [] }) } as never,
      auditService: { record: async (payload: Record<string, unknown>) => audits.push(payload) } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    const result = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: transitionAt, reason: "policy.updated", actor: { actorType: "worker" }, triggeredByUserId: "u1" });
    expect(result.changes[0]?.operation).toBe("UPDATE_VERSION");
    expect(result.changes[0]).toMatchObject({ assignmentId: "a2", previousAssignmentId: "a1" });
    expect(current).toMatchObject({ policyVersion: 1, status: "ended", effectiveTo: transitionAt });
    expect(history[1]).toMatchObject({ policyVersion: 2, status: "active", effectiveFrom: transitionAt, effectiveTo: null });
    expect(audits[0]?.metadata).toMatchObject({ triggeredByUserId: "u1" });
  });

  it("creates a temporal boundary when the meaningful matching rule set changes", async () => {
    const current = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r1", matchedRuleIds: ["r1"] });
    const updateAssignment = vi.fn(async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set));
    const createAssignment = vi.fn(async (payload: Record<string, unknown>) => assignment({ ...payload, id: "a2" }));
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: async () => [current], updateAssignment, createAssignment } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 1, source: "rule", priority: 10, winningRuleId: "r1", matchedRuleIds: ["r1", "r2"], conditionEvaluations: {}, manualAssignmentId: null }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "rule.created", actor: { actorType: "worker" } });
    expect(updateAssignment).toHaveBeenCalledOnce();
    expect(current.matchedRuleIds).toEqual(["r1"]);
    expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({ matchedRuleIds: ["r1", "r2"] }), { session: null });
  });

  it("explicitly ends and audits a manual assignment that is no longer valid", async () => {
    const current = assignment({ id: "m1", policyId: "p1", categoryId: "c1", source: "manual" });
    const auditRecord = vi.fn();
    const service = createPolicyReconciliationService({
      repository: {
        findAssignmentsAsOf: async () => [current],
        updateAssignment: async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set),
      } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [], suppressedCandidates: [] }) } as never,
      auditService: { record: auditRecord } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    const result = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "policy.archived", actor: { actorType: "worker" } });
    expect(result.changes[0]?.operation).toBe("END");
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MANUAL_ASSIGNMENT_ENDED",
        entityType: "manual_assignment",
      }),
      null,
    );
  });

  it("preserves versioned as-of history and is idempotent after a transition", async () => {
    const transitionAt = new Date("2026-09-04T00:00:00.000Z");
    const beforeTransition = new Date("2026-09-02T00:00:00.000Z");
    const afterTransition = new Date("2026-09-05T00:00:00.000Z");
    const history = [assignment({ id: "a1", businessId: "b1", employeeId: "e1", policyId: "p1", categoryId: "c1", policyVersion: 2, winningRuleId: "r-a", matchedRuleIds: ["r-a"] })];
    let sequence = 1;
    const repository = {
      findAssignmentsAsOf: async (_businessId: string, _employeeId: string, asOf: Date) => history.filter((item) => item.effectiveFrom <= asOf && (!item.effectiveTo || item.effectiveTo > asOf)),
      updateAssignment: async (assignmentId: string, update: { $set: Record<string, unknown> }) => {
        const item = history.find((candidate) => candidate.id === assignmentId);
        return item ? Object.assign(item, update.$set) : null;
      },
      createAssignment: async (payload: Record<string, unknown>) => {
        const created = assignment({ ...payload, id: `a${++sequence}` });
        history.push(created);
        return created;
      },
      findRulesByIds: vi.fn().mockResolvedValue([]),
    };
    const desired = { policyId: "p1", categoryId: "c1", policyVersion: 3, source: "rule" as const, priority: 10, winningRuleId: "r-b", matchedRuleIds: ["r-b", "r-c"], conditionEvaluations: {}, manualAssignmentId: null };
    const service = createPolicyReconciliationService({
      repository: repository as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [desired], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });

    await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: transitionAt, reason: "policy.updated", actor: { actorType: "worker" } });
    const repeated = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: afterTransition, reason: "periodic", actor: { actorType: "worker" } });
    const september2 = await service.getAssignments("b1", "e1", beforeTransition);
    const september5 = await service.getAssignments("b1", "e1", afterTransition);

    expect(september2[0]).toMatchObject({ id: "a1", policyVersion: 2, winningRuleId: "r-a" });
    expect(september5[0]).toMatchObject({ id: "a2", policyVersion: 3, winningRuleId: "r-b" });
    expect(history[0]).toMatchObject({ effectiveTo: transitionAt, status: "ended" });
    expect(history[1]).toMatchObject({ effectiveFrom: transitionAt, status: "active" });
    expect(repeated.changes).toEqual([{ operation: "KEEP", policyId: "p1", assignmentId: "a2" }]);
    expect(history).toHaveLength(2);
    expect(history.filter((item) => item.status === "active")).toHaveLength(1);
  });

  it("does not split for matched-rule ordering alone", async () => {
    const current = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r1", matchedRuleIds: ["r2", "r1"] });
    const createAssignment = vi.fn();
    const updateAssignment = vi.fn();
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: async () => [current], createAssignment, updateAssignment } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 1, source: "rule", priority: 10, winningRuleId: "r1", matchedRuleIds: ["r1", "r2"], conditionEvaluations: {}, manualAssignmentId: null }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    const result = await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date(), reason: "periodic", actor: { actorType: "worker" } });
    expect(result.changes[0]?.operation).toBe("KEEP");
    expect(createAssignment).not.toHaveBeenCalled();
    expect(updateAssignment).not.toHaveBeenCalled();
  });

  it("creates a replacement when only the winning rule changes", async () => {
    const current = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r1", matchedRuleIds: ["r1", "r2"] });
    const createAssignment = vi.fn(async (payload: Record<string, unknown>) => assignment({ ...payload, id: "a2" }));
    const service = createPolicyReconciliationService({
      repository: {
        findAssignmentsAsOf: async () => [current],
        updateAssignment: async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set),
        createAssignment,
      } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 1, source: "rule", priority: 10, winningRuleId: "r2", matchedRuleIds: ["r1", "r2"], conditionEvaluations: {}, manualAssignmentId: null }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date("2026-09-04"), reason: "rule.updated", actor: { actorType: "worker" } });
    expect(current).toMatchObject({ winningRuleId: "r1", status: "ended" });
    expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({ winningRuleId: "r2", status: "active" }), { session: null });
  });

  it("preserves manual assignment lifecycle while versioning its policy snapshot", async () => {
    const current = assignment({ id: "m1", policyId: "p1", categoryId: "c1", source: "manual", policyVersion: 1, createdBy: "u1" });
    const createAssignment = vi.fn(async (payload: Record<string, unknown>) => assignment({ ...payload, id: "m2" }));
    const service = createPolicyReconciliationService({
      repository: {
        findAssignmentsAsOf: async () => [current],
        updateAssignment: async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set),
        createAssignment,
      } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 2, source: "manual", priority: null, winningRuleId: null, matchedRuleIds: [], conditionEvaluations: {}, manualAssignmentId: "m1" }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    await service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date("2026-09-04"), reason: "policy.updated", actor: { actorType: "worker" } });
    expect(current).toMatchObject({ source: "manual", policyVersion: 1, status: "ended" });
    expect(createAssignment).toHaveBeenCalledWith(expect.objectContaining({ source: "manual", policyVersion: 2, createdBy: "u1" }), { session: null });
  });

  it("rolls back the ended interval when replacement creation fails", async () => {
    const current = assignment({ id: "a1", policyId: "p1", categoryId: "c1", policyVersion: 2, winningRuleId: "r1", matchedRuleIds: ["r1"] });
    const service = createPolicyReconciliationService({
      repository: {
        findAssignmentsAsOf: async () => [current],
        updateAssignment: async (_id: string, update: { $set: Record<string, unknown> }) => Object.assign(current, update.$set),
        createAssignment: async () => { throw new Error("insert failed"); },
      } as never,
      employeeRepository: {} as never,
      resolver: { resolvePoliciesForEmployee: async () => ({ desiredPolicies: [{ policyId: "p1", categoryId: "c1", policyVersion: 3, source: "rule", priority: 10, winningRuleId: "r1", matchedRuleIds: ["r1"], conditionEvaluations: {}, manualAssignmentId: null }], suppressedCandidates: [] }) } as never,
      auditService: { record: vi.fn() } as never,
      withTransaction: async (work) => {
        const snapshot = { ...current };
        try { return await work(null as never); }
        catch (error) { Object.assign(current, snapshot); throw error; }
      },
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });
    await expect(service.reconcileEmployeePolicies({ businessId: "b1", employeeId: "e1", asOfDate: new Date("2026-09-04"), reason: "policy.updated", actor: { actorType: "worker" } })).rejects.toThrow("insert failed");
    expect(current).toMatchObject({ status: "active", effectiveTo: null, policyVersion: 2 });
  });

  it("adds current winning and matched rule names to assignment responses", async () => {
    const automatic = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r2", matchedRuleIds: ["r1", "r2"] });
    const findRulesByIds = vi.fn().mockResolvedValue([{ id: "r1", name: "Engineering" }, { id: "r2", name: null }]);
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: vi.fn().mockResolvedValue([automatic]), findRulesByIds } as never,
      employeeRepository: {} as never,
      resolver: {} as never,
      auditService: {} as never,
      withTransaction: vi.fn() as never,
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });

    const result = await service.getAssignments("b1", "e1", new Date());
    expect(findRulesByIds).toHaveBeenCalledWith("b1", ["r2", "r1"]);
    expect(result[0]).toMatchObject({
      winningRuleId: "r2",
      matchedRuleIds: ["r1", "r2"],
      winningRule: { id: "r2", name: null },
      matchedRules: [{ id: "r1", name: "Engineering" }, { id: "r2", name: null }],
    });
  });

  it("omits deleted matched rules and nulls a deleted winning rule", async () => {
    const automatic = assignment({ id: "a1", policyId: "p1", categoryId: "c1", winningRuleId: "r-deleted", matchedRuleIds: ["r-live", "r-deleted"] });
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: vi.fn().mockResolvedValue([automatic]), findRulesByIds: vi.fn().mockResolvedValue([{ id: "r-live", name: "Active employees" }]) } as never,
      employeeRepository: {} as never,
      resolver: {} as never,
      auditService: {} as never,
      withTransaction: vi.fn() as never,
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });

    const result = await service.getAssignments("b1", "e1", new Date());
    expect(result[0]).toMatchObject({ winningRule: null, matchedRules: [{ id: "r-live", name: "Active employees" }] });
  });

  it("returns empty rule details for manual assignments without querying rules", async () => {
    const manual = assignment({ id: "m1", policyId: "p1", categoryId: "c1", source: "manual", winningRuleId: "legacy-rule", matchedRuleIds: ["legacy-rule"] });
    const findRulesByIds = vi.fn();
    const service = createPolicyReconciliationService({
      repository: { findAssignmentsAsOf: vi.fn().mockResolvedValue([manual]), findRulesByIds } as never,
      employeeRepository: {} as never,
      resolver: {} as never,
      auditService: {} as never,
      withTransaction: vi.fn() as never,
      createHttpError: (message, statusCode) => Object.assign(new Error(message), { statusCode }),
    });

    const result = await service.getAssignments("b1", "e1", new Date());
    expect(result[0]).toMatchObject({ winningRuleId: "legacy-rule", matchedRuleIds: ["legacy-rule"], winningRule: null, matchedRules: [] });
    expect(findRulesByIds).not.toHaveBeenCalled();
  });
});
