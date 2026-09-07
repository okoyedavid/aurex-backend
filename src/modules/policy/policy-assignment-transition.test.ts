import { describe, expect, it } from "vitest";
import { planAssignmentTransitions, type AssignmentSnapshot } from "./policy-assignment-transition.js";
import type { ResolvedPolicy } from "./policy-resolver.service.js";

const current: AssignmentSnapshot = { id: "a1", policyId: "p1", categoryId: "c1", policyVersion: 1, source: "rule", winningRuleId: "r1", matchedRuleIds: ["r2", "r1"], status: "active", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, resolvedAt: new Date("2026-01-01") };
const desired = (overrides: Partial<ResolvedPolicy> = {}): ResolvedPolicy => ({ policyId: "p1", categoryId: "c1", policyVersion: 1, source: "rule", priority: 10, winningRuleId: "r1", winningRuleName: "Rule", matchedRuleIds: ["r1", "r2"], matchedRuleNames: ["One", "Two"], conditionEvaluations: {}, manualAssignmentId: null, ...overrides });

describe("shared assignment transition planner", () => {
  it("keeps semantically identical snapshots regardless of rule ordering", () => { expect(planAssignmentTransitions({ current: [current], desired: [desired()], asOfDate: new Date("2026-02-01") })[0]?.operation).toBe("KEEP"); });
  it("creates an exclusive temporal boundary when snapshot state changes", () => { const at = new Date("2026-02-01"); const transition = planAssignmentTransitions({ current: [current], desired: [desired({ policyVersion: 2 })], asOfDate: at, createId: () => "a2" })[0]; expect(transition).toMatchObject({ operation: "UPDATE_VERSION", ended: { effectiveTo: at }, assignment: { id: "a2", effectiveFrom: at, policyVersion: 2 } }); });
});
