import { describe, expect, it } from "vitest";
import type { PolicyRuleCondition } from "./policy-rule.model.js";
import {
  calculateTenureMonths,
  evaluateCondition,
  evaluateRule,
  type EmployeePolicyContext,
} from "./rule-evaluator.js";

const evaluationDate = new Date("2026-08-31T00:00:00.000Z");
const employeeContext: EmployeePolicyContext = {
  employeeId: "employee-1",
  employeeListId: "department-1",
  employeeTypeId: "type-1",
  groupIds: ["group-1", "group-2"],
  state: "CA",
  employmentStartDate: new Date("2024-08-31T00:00:00.000Z"),
};

const evaluate = (condition: PolicyRuleCondition) =>
  evaluateCondition({ employeeContext, condition, evaluationDate });

describe("policy rule evaluator", () => {
  it.each([
    [{ field: "department", operator: "equals", value: "department-1" }, true],
    [{ field: "employeeType", operator: "equals", value: "type-1" }, true],
    [{ field: "group", operator: "contains", value: "group-2" }, true],
    [{ field: "state", operator: "equals", value: "CA" }, true],
    [{ field: "tenure", operator: "gte", value: 24 }, true],
  ] as const)("evaluates %o", (condition, matched) => {
    expect(evaluate(condition).matched).toBe(matched);
  });

  it("uses AND semantics", () => {
    const result = evaluateRule({
      employeeContext,
      evaluationDate,
      conditions: [
        { field: "state", operator: "equals", value: "CA" },
        { field: "tenure", operator: "gt", value: 24 },
      ],
    });
    expect(result.matched).toBe(false);
    expect(result.conditions).toHaveLength(2);
  });

  it("calculates completed tenure months as of the evaluation date", () => {
    expect(calculateTenureMonths(new Date("2024-09-01T00:00:00Z"), evaluationDate)).toBe(23);
    expect(calculateTenureMonths(new Date("2024-08-31T00:00:00Z"), evaluationDate)).toBe(24);
  });

  it("normalizes object-id-like values before comparison", () => {
    const objectIdLike = { toString: () => "department-1" };
    expect(evaluate({ field: "department", operator: "equals", value: objectIdLike as never }).matched).toBe(true);
  });

  it.each([
    [{ field: "department", operator: "in", value: ["department-2", "department-1"] }, true],
    [{ field: "department", operator: "not_in", value: ["department-2"] }, true],
    [{ field: "state", operator: "not_equals", value: "NY" }, true],
    [{ field: "group", operator: "not_contains", value: "group-3" }, true],
    [{ field: "group", operator: "in", value: ["group-3", "group-1"] }, true],
    [{ field: "tenure", operator: "lte", value: 24 }, true],
    [{ field: "tenure", operator: "gt", value: 23 }, true],
    [{ field: "tenure", operator: "lt", value: 24 }, false],
  ] as const)("supports field-specific operator %o", (condition, matched) => {
    expect(evaluate(condition).matched).toBe(matched);
  });

  it("rejects an operator that is invalid for a field", () => {
    expect(
      evaluate({
        field: "state",
        operator: "contains",
        value: "C",
      } as PolicyRuleCondition).matched,
    ).toBe(false);
  });
});
