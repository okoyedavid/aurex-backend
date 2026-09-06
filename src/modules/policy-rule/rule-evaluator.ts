import type {
  PolicyRuleCondition,
  PolicyRuleField,
  PolicyRuleOperator,
} from "./policy-rule.model.js";

export type EmployeePolicyContext = {
  employeeId: string;
  employeeListId: string;
  employeeTypeId: string | null;
  groupIds: string[];
  state: string | null;
  status: string;
  employmentStartDate: Date | null;
};

export type ConditionEvaluation = {
  condition: PolicyRuleCondition;
  actualValue: string | string[] | number | null;
  expectedDisplayValue?: string | string[] | number | null;
  actualDisplayValue?: string | string[] | number | null;
  matched: boolean;
};

export type RuleEvaluation = {
  matched: boolean;
  conditions: ConditionEvaluation[];
};

const allowedOperators: Record<PolicyRuleField, readonly PolicyRuleOperator[]> = {
  department: ["equals", "not_equals", "in", "not_in"],
  employeeType: ["equals", "not_equals", "in", "not_in"],
  group: ["contains", "not_contains", "in", "not_in"],
  state: ["equals", "not_equals", "in", "not_in"],
  status: ["equals", "not_equals", "in", "not_in"],
  tenure: ["equals", "not_equals", "gte", "lte", "gt", "lt"],
};

export const isOperatorAllowedForField = (
  field: PolicyRuleField,
  operator: PolicyRuleOperator,
) => allowedOperators[field].includes(operator);

const normalizeScalar = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

const normalizeArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

export const calculateTenureMonths = (
  employmentStartDate: Date | null,
  evaluationDate: Date,
) => {
  if (!employmentStartDate || employmentStartDate > evaluationDate) return 0;

  let months =
    (evaluationDate.getUTCFullYear() - employmentStartDate.getUTCFullYear()) *
      12 +
    evaluationDate.getUTCMonth() -
    employmentStartDate.getUTCMonth();

  if (evaluationDate.getUTCDate() < employmentStartDate.getUTCDate()) {
    months -= 1;
  }

  return Math.max(0, months);
};

const actualValueForField = (
  context: EmployeePolicyContext,
  field: PolicyRuleField,
  evaluationDate: Date,
) => {
  switch (field) {
    case "department":
      return context.employeeListId;
    case "employeeType":
      return context.employeeTypeId;
    case "group":
      return context.groupIds;
    case "state":
      return context.state;
    case "status":
      return context.status;
    case "tenure":
      return calculateTenureMonths(context.employmentStartDate, evaluationDate);
  }
};

export const evaluateCondition = ({
  employeeContext,
  condition,
  evaluationDate,
}: {
  employeeContext: EmployeePolicyContext;
  condition: PolicyRuleCondition;
  evaluationDate: Date;
}): ConditionEvaluation => {
  const actualValue = actualValueForField(
    employeeContext,
    condition.field,
    evaluationDate,
  );

  if (!isOperatorAllowedForField(condition.field, condition.operator)) {
    return { condition, actualValue, matched: false };
  }

  let matched = false;
  if (condition.field === "tenure") {
    const expected = Number(condition.value);
    const actual = Number(actualValue);
    if (!Number.isFinite(expected)) matched = false;
    else if (condition.operator === "equals") matched = actual === expected;
    else if (condition.operator === "not_equals") matched = actual !== expected;
    else if (condition.operator === "gte") matched = actual >= expected;
    else if (condition.operator === "lte") matched = actual <= expected;
    else if (condition.operator === "gt") matched = actual > expected;
    else if (condition.operator === "lt") matched = actual < expected;
  } else if (condition.field === "group") {
    const actual = normalizeArray(actualValue);
    const expectedValues = Array.isArray(condition.value)
      ? normalizeArray(condition.value)
      : [String(condition.value)];
    const overlaps = expectedValues.some((value) => actual.includes(value));
    if (["contains", "in"].includes(condition.operator)) matched = overlaps;
    if (["not_contains", "not_in"].includes(condition.operator)) matched = !overlaps;
  } else {
    const actual = normalizeScalar(actualValue);
    const expected = normalizeScalar(condition.value);
    const expectedValues = normalizeArray(condition.value);
    if (condition.operator === "equals") matched = actual === expected;
    if (condition.operator === "not_equals") matched = actual !== expected;
    if (condition.operator === "in") matched = actual !== null && expectedValues.includes(actual);
    if (condition.operator === "not_in") matched = actual === null || !expectedValues.includes(actual);
  }

  return { condition, actualValue, matched };
};

export const evaluateRule = ({
  employeeContext,
  conditions,
  evaluationDate,
}: {
  employeeContext: EmployeePolicyContext;
  conditions: PolicyRuleCondition[];
  evaluationDate: Date;
}): RuleEvaluation => {
  const evaluations = conditions.map((condition) =>
    evaluateCondition({ employeeContext, condition, evaluationDate }),
  );

  return {
    matched: evaluations.length > 0 && evaluations.every(({ matched }) => matched),
    conditions: evaluations,
  };
};
