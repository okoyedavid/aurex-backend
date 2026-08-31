import { describe, expect, it, vi } from "vitest";
import { createWarpDemoService } from "./warp-demo.service.js";

const businessId = "68b000000000000000000001";
const employeeId = "68b000000000000000000002";
const policyId = "68b000000000000000000003";
const categoryId = "68b000000000000000000004";
const departmentId = "68b000000000000000000005";
const typeId = "68b000000000000000000006";
const groupId = "68b000000000000000000007";
const ruleId = "68b000000000000000000008";

const setup = (configuredBusinessId: string | undefined = businessId) => {
  const employee = { _id: employeeId, fullName: "Sarah Chen", jobTitle: "VP Engineering", employeeListId: departmentId, employeeTypeId: typeId, groupIds: [groupId], state: "California", employmentStartDate: new Date("2020-01-01"), bankName: "SECRET BANK", accountNumber: "SECRET ACCOUNT", amount: 100000, businessMemberId: "SECRET MEMBER" };
  const category = { _id: categoryId, name: "Vacation Plan", description: "One plan wins", cardinality: "ONE", status: "active" };
  const policy = { _id: policyId, categoryId, name: "Executive Vacation", description: "Executive plan", status: "active", version: 1, effectiveFrom: null, effectiveTo: null, configuration: { secret: true } };
  const rule = { _id: ruleId, policyId, name: "Executive", priority: 40, status: "active", conditions: [{ field: "group", operator: "contains", value: groupId }] };
  const repository = {
    findBusiness: vi.fn(async () => ({ _id: businessId, name: "Northstar Labs", email: "warp-demo@northstar.invalid", ownerUserId: "SECRET OWNER" })),
    listEmployees: vi.fn(async () => [employee]), findEmployee: vi.fn(async (_businessId: string, id: string) => id === employeeId ? employee : null),
    listEmployeeLists: vi.fn(async () => [{ _id: departmentId, name: "Engineering" }]), listEmployeeTypes: vi.fn(async () => [{ _id: typeId, name: "Full Time" }]), listEmployeeGroups: vi.fn(async () => [{ _id: groupId, name: "Executive" }]),
    listCategories: vi.fn(async () => [category]), listPolicies: vi.fn(async () => [policy]), findPolicy: vi.fn(async (_businessId: string, id: string) => id === policyId ? policy : null), listRules: vi.fn(async () => [rule]),
    listActiveAssignments: vi.fn(async () => [{ _id: "assignment", employeeId, policyId, categoryId, winningRuleId: ruleId, source: "rule", status: "active", effectiveFrom: new Date("2026-01-01"), matchedRuleIds: [ruleId] }]),
    countActiveRules: vi.fn(async () => 1), countActiveAssignments: vi.fn(async () => 1),
    listAudit: vi.fn(async () => [{ _id: "audit", entityType: "employee_policy_assignment", action: "ASSIGNMENT_CREATED", actorType: "worker", actorUserId: "SECRET USER", actorBusinessMemberId: "SECRET MEMBER", employeeId, policyId, categoryId, before: { secret: true }, after: { secret: true }, metadata: { token: true }, reason: "warp_demo_seed", occurredAt: new Date("2026-01-01") }]),
  };
  const resolver = { resolvePoliciesForEmployee: vi.fn(async () => ({ employeeId, businessId, evaluationDate: new Date("2026-01-01"), desiredPolicies: [{ policyId, categoryId }], suppressedCandidates: [], evaluatedRules: [{ ruleId, policyId, priority: 40, matched: true, conditions: [{ condition: { field: "group", operator: "contains", value: groupId }, actualValue: [groupId], matched: true }] }], categoryDecisions: [] })) };
  const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
  return { repository, resolver, service: createWarpDemoService({ repository: repository as any, resolver: resolver as any, businessId: configuredBusinessId, createHttpError }) };
};

describe("Warp demo public DTO boundary", () => {
  it("returns 503 instead of selecting a fallback tenant", async () => { const { service } = setup(null as unknown as undefined); await expect(service.overview()).rejects.toMatchObject({ statusCode: 503 }); });
  it("returns an explicit overview only", async () => { const { service } = setup(); const result = await service.overview(); expect(result).toMatchObject({ business: { name: "Northstar Labs" }, stats: { employees: 1, policies: 1 } }); expect(JSON.stringify(result)).not.toContain("SECRET OWNER"); });
  it("strips payroll, bank, membership, and tenant data from employees", async () => { const { service } = setup(); const result = await service.employee(employeeId); const json = JSON.stringify(result); expect(result).toMatchObject({ name: "Sarah Chen", department: "Engineering", employeeType: "Full Time", groups: ["Executive"] }); expect(json).not.toMatch(/SECRET|accountNumber|amount|businessMemberId|businessId/); });
  it("validates employee ownership", async () => { const { service } = setup(); await expect(service.employee("68b000000000000000000099")).rejects.toMatchObject({ statusCode: 404 }); });
  it("maps persisted assignments without internal assignment fields", async () => { const { service } = setup(); const result = await service.employeePolicies(employeeId); expect(result.policies[0]).toMatchObject({ name: "Executive Vacation", priority: 40, winningRuleName: "Executive" }); expect(JSON.stringify(result)).not.toContain("matchedRuleIds"); });
  it("delegates explanations to the existing resolver", async () => { const { service, resolver } = setup(); const result = await service.explain(employeeId); expect(resolver.resolvePoliciesForEmployee).toHaveBeenCalledWith(expect.objectContaining({ businessId, employeeId })); expect(result.categories[0].selectedPolicies).toEqual([{ id: policyId, name: "Executive Vacation" }]); });
  it("translates internal reference values for explainability", async () => { const { service } = setup(); const result = await service.explain(employeeId); expect(result.categories[0].candidates[0].matchedRules[0].conditions[0]).toMatchObject({ expectedValue: "Executive", actualValue: ["Executive"], matched: true }); });
  it("returns actual cardinality semantics", async () => { const { service } = setup(); expect((await service.categories()).categories[0]).toMatchObject({ cardinality: "ONE", maxAssignments: 1 }); });
  it("does not expose policy configuration or creator fields", async () => { const { service } = setup(); const json = JSON.stringify(await service.policy(policyId)); expect(json).not.toMatch(/configuration|createdBy|updatedBy|businessId|secret/); });
  it("sanitizes policy-domain audit data", async () => { const { service } = setup(); const result = await service.audit({ limit: 25 }); const json = JSON.stringify(result); expect(result.events[0].actor).toEqual({ type: "worker", displayName: "Aurex policy engine" }); expect(json).not.toMatch(/SECRET|before|after|metadata|token|actorUserId|actorBusinessMemberId/); });
});
