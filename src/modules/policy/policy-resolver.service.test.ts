import { describe, expect, it } from "vitest";
import { createPolicyResolver } from "./policy-resolver.service.js";

const document = <T extends object>(value: T) => ({ ...value, toObject: () => value });
const employee = document({ id: "e1", employeeListId: "d1", employeeTypeId: "t1", groupIds: ["g1"], state: "CA", employmentStartDate: new Date("2020-01-01"), status: "active" });
const category = (cardinality: "ONE" | "MANY") => document({ id: "c1", status: "active", cardinality });
const policy = (id: string) => document({ id, categoryId: "c1", version: 1, status: "active" });
const rule = (id: string, policyId: string, priority: number) => document({ id, policyId, priority, conditions: [{ field: "state", operator: "equals", value: "CA" }], status: "active" });

const resolverFor = ({ cardinality = "ONE", rules = [], manuals = [] }: { cardinality?: "ONE" | "MANY"; rules?: ReturnType<typeof rule>[]; manuals?: object[] }) => createPolicyResolver({
  employeeRepository: { findByIdAndBusiness: async () => employee } as never,
  employeeListRepository: { findEmployeeListByBusinessAndId: async () => ({ id: "d1", status: "active" }) } as never,
  employeeTypeRepository: { findActiveByBusinessAndId: async () => ({ id: "t1" }) } as never,
  employeeGroupRepository: { findActiveByBusinessAndIds: async () => [{ id: "g1" }] } as never,
  policyRepository: {
    findEffectiveRules: async () => rules,
    findAssignmentsAsOf: async () => manuals,
    findEffectivePolicies: async (_businessId: string, ids: string[]) => ids.map(policy),
    findCategory: async () => category(cardinality),
  } as never,
  createHttpError: (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode }),
});

describe("policy resolver", () => {
  it("uses the highest priority for ONE cardinality", async () => {
    const result = await resolverFor({ rules: [rule("r1", "p1", 10), rule("r2", "p2", 20)] }).resolvePoliciesForEmployee({ businessId: "b1", employeeId: "e1", asOfDate: new Date() });
    expect(result.desiredPolicies.map((item) => item.policyId)).toEqual(["p2"]);
    expect(result.suppressedCandidates[0]?.policyId).toBe("p1");
  });

  it("returns all distinct policies for MANY cardinality", async () => {
    const result = await resolverFor({ cardinality: "MANY", rules: [rule("r1", "p1", 10), rule("r2", "p2", 20)] }).resolvePoliciesForEmployee({ businessId: "b1", employeeId: "e1", asOfDate: new Date() });
    expect(result.desiredPolicies.map((item) => item.policyId)).toEqual(["p2", "p1"]);
  });

  it("deduplicates rules for one policy and retains all matched rule ids", async () => {
    const result = await resolverFor({ rules: [rule("r2", "p1", 10), rule("r1", "p1", 20)] }).resolvePoliciesForEmployee({ businessId: "b1", employeeId: "e1", asOfDate: new Date() });
    expect(result.desiredPolicies).toHaveLength(1);
    expect(result.desiredPolicies[0]).toMatchObject({ winningRuleId: "r1", priority: 20, matchedRuleIds: ["r1", "r2"] });
  });

  it("uses policy id as a deterministic equal-priority tie breaker", async () => {
    const resolver = resolverFor({ rules: [rule("r2", "p2", 10), rule("r1", "p1", 10)] });
    const winners = await Promise.all(Array.from({ length: 5 }, () => resolver.resolvePoliciesForEmployee({ businessId: "b1", employeeId: "e1", asOfDate: new Date() })));
    expect(winners.every((result) => result.desiredPolicies[0]?.policyId === "p1")).toBe(true);
  });

  it("gives a manual assignment precedence without magic priority", async () => {
    const manual = document({ id: "a1", policyId: "p1", categoryId: "c1", source: "manual", status: "active" });
    const result = await resolverFor({ rules: [rule("r2", "p2", 999)], manuals: [manual] }).resolvePoliciesForEmployee({ businessId: "b1", employeeId: "e1", asOfDate: new Date() });
    expect(result.desiredPolicies[0]).toMatchObject({ policyId: "p1", source: "manual", priority: null });
    expect(result.suppressedCandidates[0]).toMatchObject({ policyId: "p2", reason: "manual_override" });
  });
});
