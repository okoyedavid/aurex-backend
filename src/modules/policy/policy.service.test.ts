import { describe, expect, it, vi } from "vitest";
import { PolicyRule } from "../policy-rule/policy-rule.model.js";
import { createPolicyService } from "./policy.service.js";

describe("policy service change detection", () => {
  it("compares a hydrated rule document array without recursing into Mongoose internals", async () => {
    const rule = new PolicyRule({
      businessId: "68b000000000000000000001",
      policyId: "68b000000000000000000002",
      name: "California employees",
      conditions: [{ field: "state", operator: "equals", value: "CA" }],
      priority: 10,
      version: 1,
      status: "active",
      createdBy: "68b000000000000000000003",
      updatedBy: "68b000000000000000000003",
    });
    const updateRule = vi.fn();
    const auditRecord = vi.fn();
    const service = createPolicyService({
      repository: {
        findRule: vi.fn(async () => rule),
        findPolicy: vi.fn(async () => ({ version: 1 })),
        updateRule,
      } as never,
      auditService: { record: auditRecord } as never,
      businessMemberRepository: {
        findActiveMembershipByBusinessAndUser: vi.fn(async () => ({ id: "member-1" })),
      } as never,
      employeeListRepository: {} as never,
      employeeTypeRepository: {} as never,
      employeeGroupRepository: {} as never,
      withTransaction: async (work) => work(null as never),
      createHttpError: (message, statusCode) =>
        Object.assign(new Error(message), { statusCode }),
    });

    const result = await service.updateRule(
      "68b000000000000000000001",
      rule.id,
      "68b000000000000000000003",
      {
        conditions: [{ field: "state", operator: "equals", value: "CA" }],
      },
    );

    expect(result.rule).toBe(rule);
    expect(updateRule).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });
});
