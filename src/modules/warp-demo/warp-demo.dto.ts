import { calculateTenureMonths } from "../policy-rule/rule-evaluator.js";
import type { PolicyResolution } from "../policy/policy-resolver.types.js";
import type { SandboxEmployee, WarpDemoSeed } from "./warp-demo.types.js";

export type WarpDemoDocument = Record<string, any>;
export type WarpDemoDimensionLookup = {
  departments: Map<string, string>;
  employeeTypes: Map<string, string>;
  groups: Map<string, string>;
};

export const documentId = (value: unknown) => String(value);

export const isoDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : value
      ? new Date(String(value)).toISOString()
      : null;

export const createDimensionLookup = (seed: WarpDemoSeed): WarpDemoDimensionLookup => ({
  departments: new Map(seed.departments.map((item) => [item.id, item.name])),
  employeeTypes: new Map(seed.employeeTypes.map((item) => [item.id, item.name])),
  groups: new Map(seed.groups.map((item) => [item.id, item.name])),
});

export const employeeDto = (
  employee: WarpDemoDocument,
  lookup: WarpDemoDimensionLookup,
  now = new Date(),
) => ({
  id: documentId(employee._id ?? employee.id),
  name: employee.fullName,
  jobTitle: employee.jobTitle ?? null,
  department: lookup.departments.get(documentId(employee.employeeListId)) ?? "Unknown",
  employeeType: employee.employeeTypeId
    ? lookup.employeeTypes.get(documentId(employee.employeeTypeId)) ?? "Unknown"
    : null,
  state: employee.state ?? null,
  employmentStartDate: isoDate(employee.employmentStartDate),
  tenureMonths: calculateTenureMonths(
    employee.employmentStartDate ? new Date(employee.employmentStartDate) : null,
    now,
  ),
  groups: (employee.groupIds ?? [])
    .map((groupId: unknown) => lookup.groups.get(documentId(groupId)))
    .filter(Boolean),
});

export const publicEmployee = (value: ReturnType<typeof employeeDto>) => {
  const { id: _internalId, ...safe } = value;
  return { alias: "maya" as const, ...safe };
};

export const normalizeCategory = (item: WarpDemoDocument) => ({
  id: documentId(item._id ?? item.id),
  name: item.name,
  description: item.description ?? null,
  cardinality: item.cardinality as "ONE" | "MANY",
  status: item.status,
});

export const normalizePolicy = (item: WarpDemoDocument) => ({
  id: documentId(item._id ?? item.id),
  categoryId: documentId(item.categoryId),
  name: item.name,
  description: item.description ?? null,
  version: item.version,
  status: item.status,
  effectiveFrom: isoDate(item.effectiveFrom),
  effectiveTo: isoDate(item.effectiveTo),
  ...(item.configuration ? { configuration: item.configuration } : {}),
});

export const normalizeRule = (item: WarpDemoDocument) => ({
  id: documentId(item._id ?? item.id),
  policyId: documentId(item.policyId),
  name: item.name ?? null,
  conditions: item.conditions.map((condition: WarpDemoDocument) => ({
    field: condition.field,
    operator: condition.operator,
    value: Array.isArray(condition.value)
      ? condition.value.map(documentId)
      : condition.value && typeof condition.value === "object"
        ? documentId(condition.value)
        : condition.value,
  })),
  priority: item.priority,
  version: item.version,
  status: item.status,
  effectiveFrom: isoDate(item.effectiveFrom),
  effectiveTo: isoDate(item.effectiveTo),
});

export const mapPolicies = (
  employee: unknown,
  assignments: WarpDemoDocument[],
  policies: WarpDemoDocument[],
  categories: WarpDemoDocument[],
  rules: WarpDemoDocument[],
) => {
  const policyById = new Map(policies.map((item) => [documentId(item._id ?? item.id), item]));
  const categoryById = new Map(categories.map((item) => [documentId(item._id ?? item.id), item]));
  const ruleById = new Map(rules.map((item) => [documentId(item._id ?? item.id), item]));

  return {
    employee,
    policies: assignments.flatMap((assignment) => {
      const policy = policyById.get(documentId(assignment.policyId));
      const category = categoryById.get(documentId(assignment.categoryId));
      if (!policy || !category) return [];
      const rule = assignment.winningRuleId
        ? ruleById.get(documentId(assignment.winningRuleId))
        : null;
      return [{
        id: documentId(policy._id ?? policy.id),
        name: policy.name,
        category: {
          id: documentId(category._id ?? category.id),
          name: category.name,
          cardinality: category.cardinality,
          maxAssignments: category.cardinality === "ONE" ? 1 : null,
        },
        source: assignment.source,
        priority: rule?.priority ?? null,
        effectiveFrom: isoDate(assignment.effectiveFrom),
        effectiveTo: isoDate(assignment.effectiveTo),
        winningRuleName: rule?.name ?? null,
      }];
    }),
  };
};

export const explanation = (
  employee: unknown,
  resolution: PolicyResolution,
  policies: WarpDemoDocument[],
  categories: WarpDemoDocument[],
) => {
  const policyById = new Map(policies.map((item) => [documentId(item.id ?? item._id), item]));
  const selected = new Set(resolution.desiredPolicies.map((item) => item.policyId));
  return {
    employee,
    evaluationDate: resolution.evaluationDate.toISOString(),
    evaluatedRules: resolution.evaluatedRules,
    categories: categories.map((category) => {
      const policyIds = policies
        .filter((item) => documentId(item.categoryId) === documentId(category.id ?? category._id))
        .map((item) => documentId(item.id ?? item._id));
      const candidates = policyIds.flatMap((policyId) => {
        const evaluations = resolution.evaluatedRules.filter((item) => item.policyId === policyId);
        if (!evaluations.length) return [];
        const matched = evaluations.filter((item) => item.matched);
        return [{
          policyId,
          policyName: policyById.get(policyId)?.name ?? "Unknown policy",
          matched: matched.length > 0,
          priority: Math.max(...evaluations.map((item) => item.priority)),
          selected: selected.has(policyId),
          source: "rule",
          matchedRules: matched.map((item) => ({
            ruleId: item.ruleId,
            ruleName: item.ruleName ?? null,
            priority: item.priority,
            conditions: item.conditions.map((entry) => ({
              field: entry.condition.field,
              operator: entry.condition.operator,
              expectedValue: entry.expectedDisplayValue ?? entry.condition.value,
              actualValue: entry.actualDisplayValue ?? entry.actualValue,
              matched: entry.matched,
            })),
          })),
          suppressedReason: resolution.suppressedCandidates.some(
            (candidate) => candidate.policyId === policyId,
          )
            ? "cardinality_limit"
            : null,
        }];
      });
      return {
        category: {
          id: documentId(category.id ?? category._id),
          name: category.name,
          cardinality: category.cardinality,
          maxAssignments: category.cardinality === "ONE" ? 1 : null,
        },
        candidates,
        selectedPolicies: candidates
          .filter((item) => item.selected)
          .map((item) => ({ id: item.policyId, name: item.policyName })),
      };
    }),
  };
};

export const auditDto = (
  event: WarpDemoDocument,
  employeeName?: string,
  policyName?: string,
) => ({
  id: documentId(event._id ?? event.id),
  timestamp: isoDate(event.occurredAt),
  entityType: event.entityType,
  action: event.action,
  ...(employeeName ? { employeeName } : {}),
  ...(policyName ? { policyName } : {}),
  actor: {
    type: event.actorType,
    displayName: event.actorType === "demo" ? "Demo reviewer" : "Aurex policy engine",
  },
  summary: [
    String(event.action).replaceAll("_", " ").toLowerCase(),
    policyName,
    employeeName ? `for ${employeeName}` : null,
  ]
    .filter(Boolean)
    .join(" "),
  ...(event.reason ? { reason: event.reason } : {}),
});

export const sandboxEmployeeDto = (employee: SandboxEmployee, seed: WarpDemoSeed) =>
  publicEmployee(employeeDto({ ...employee, _id: employee.id }, createDimensionLookup(seed)));
