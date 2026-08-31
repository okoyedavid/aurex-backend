import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { PolicyRuleCondition } from "../policy-rule/policy-rule.model.js";
import { evaluateRule, type ConditionEvaluation } from "../policy-rule/rule-evaluator.js";
import type { HttpError } from "../../utils/api-error.js";
import type { PolicyRepository } from "./policy.repository.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";

export type ResolvedPolicy = {
  policyId: string;
  categoryId: string;
  policyVersion: number;
  source: "rule" | "manual";
  priority: number | null;
  winningRuleId: string | null;
  matchedRuleIds: string[];
  conditionEvaluations: Record<string, ConditionEvaluation[]>;
  manualAssignmentId: string | null;
};

export type SuppressedPolicyCandidate = ResolvedPolicy & {
  reason: "category_cardinality" | "manual_override";
};

type Dependencies = {
  employeeRepository: EmployeeRepository;
  policyRepository: PolicyRepository;
  employeeListRepository: EmployeeListRepository;
  employeeTypeRepository: EmployeeTypeRepository;
  employeeGroupRepository: EmployeeGroupRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const id = (value: unknown) => String(value);

export const createPolicyResolver = ({
  employeeRepository,
  policyRepository,
  employeeListRepository,
  employeeTypeRepository,
  employeeGroupRepository,
  createHttpError,
}: Dependencies) => {
  const resolvePoliciesForEmployee = async ({
    businessId,
    employeeId,
    asOfDate,
  }: {
    businessId: string;
    employeeId: string;
    asOfDate: Date;
  }) => {
    const employee = await employeeRepository.findByIdAndBusiness(employeeId, businessId);
    if (!employee) throw createHttpError("Employee not found in this business", 404);
    if (employee.status === "archived") {
      return {
        employeeId,
        businessId,
        evaluationDate: asOfDate,
        intervalSemantics: "effectiveFrom <= asOf < effectiveTo",
        desiredPolicies: [] as ResolvedPolicy[],
        suppressedCandidates: [] as SuppressedPolicyCandidate[],
        evaluatedRules: [],
        categoryDecisions: [],
      };
    }

    const [rules, assignmentsAtDate] = await Promise.all([
      policyRepository.findEffectiveRules(businessId, asOfDate),
      policyRepository.findAssignmentsAsOf(businessId, employeeId, asOfDate),
    ]);
    const manualAssignments = assignmentsAtDate.filter((item) => item.source === "manual");
    const policyIds = [...new Set([
      ...rules.map((rule) => id(rule.policyId)),
      ...manualAssignments.map((assignment) => id(assignment.policyId)),
    ])];
    const policies = await policyRepository.findEffectivePolicies(businessId, policyIds, asOfDate);
    const policyById = new Map(policies.map((policy) => [policy.id, policy]));
    const categoryIds = [...new Set(policies.map((policy) => id(policy.categoryId)))];
    const categoryEntries = await Promise.all(
      categoryIds.map(async (categoryId) => [categoryId, await policyRepository.findCategory(businessId, categoryId)] as const),
    );
    const categoryById = new Map(
      categoryEntries.filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1] && entry[1].status === "active")),
    );

    const employeeListId = id(employee.employeeListId);
    const employeeTypeId = employee.employeeTypeId ? id(employee.employeeTypeId) : null;
    const employeeGroupIds = (employee.groupIds ?? []).map(id);
    const [activeDepartment, activeEmployeeType, activeGroups] = await Promise.all([
      employeeListRepository.findEmployeeListByBusinessAndId(businessId, employeeListId),
      employeeTypeId ? employeeTypeRepository.findActiveByBusinessAndId(businessId, employeeTypeId) : null,
      employeeGroupRepository.findActiveByBusinessAndIds(businessId, employeeGroupIds),
    ]);

    const context = {
      employeeId,
      employeeListId: activeDepartment?.status === "active" ? employeeListId : "",
      employeeTypeId: activeEmployeeType ? employeeTypeId : null,
      groupIds: activeGroups.map((group) => group.id),
      state: employee.state ?? null,
      employmentStartDate: employee.employmentStartDate ?? null,
    };

    const automaticByPolicy = new Map<string, ResolvedPolicy>();
    const evaluatedRules: Array<{
      ruleId: string;
      policyId: string;
      priority: number;
      matched: boolean;
      conditions: ConditionEvaluation[];
    }> = [];
    for (const rule of rules) {
      const policy = policyById.get(id(rule.policyId));
      if (!policy || !categoryById.has(id(policy.categoryId))) continue;
      const evaluation = evaluateRule({
        employeeContext: context,
        conditions: rule.conditions as PolicyRuleCondition[],
        evaluationDate: asOfDate,
      });
      evaluatedRules.push({
        ruleId: rule.id,
        policyId: policy.id,
        priority: rule.priority,
        matched: evaluation.matched,
        conditions: evaluation.conditions,
      });
      if (!evaluation.matched) continue;

      const policyId = policy.id;
      const existing = automaticByPolicy.get(policyId);
      const ruleId = rule.id;
      if (!existing) {
        automaticByPolicy.set(policyId, {
          policyId,
          categoryId: id(policy.categoryId),
          policyVersion: policy.version,
          source: "rule",
          priority: rule.priority,
          winningRuleId: ruleId,
          matchedRuleIds: [ruleId],
          conditionEvaluations: { [ruleId]: evaluation.conditions },
          manualAssignmentId: null,
        });
      } else {
        existing.matchedRuleIds.push(ruleId);
        existing.conditionEvaluations[ruleId] = evaluation.conditions;
        const wins =
          rule.priority > (existing.priority ?? -1) ||
          (rule.priority === existing.priority && ruleId.localeCompare(existing.winningRuleId ?? "") < 0);
        if (wins) {
          existing.priority = rule.priority;
          existing.winningRuleId = ruleId;
        }
      }
    }

    const manual: ResolvedPolicy[] = manualAssignments.flatMap((assignment) => {
      const policy = policyById.get(id(assignment.policyId));
      if (!policy || !categoryById.has(id(policy.categoryId))) return [];
      return [{
        policyId: policy.id,
        categoryId: id(policy.categoryId),
        policyVersion: policy.version,
        source: "manual" as const,
        priority: null,
        winningRuleId: null,
        matchedRuleIds: [],
        conditionEvaluations: {},
        manualAssignmentId: assignment.id,
      }];
    });

    for (const candidate of automaticByPolicy.values()) {
      candidate.matchedRuleIds.sort((a, b) => a.localeCompare(b));
    }

    const allByCategory = new Map<string, { manual: ResolvedPolicy[]; automatic: ResolvedPolicy[] }>();
    for (const candidate of [...manual, ...automaticByPolicy.values()]) {
      const bucket = allByCategory.get(candidate.categoryId) ?? { manual: [], automatic: [] };
      bucket[candidate.source === "manual" ? "manual" : "automatic"].push(candidate);
      allByCategory.set(candidate.categoryId, bucket);
    }

    const desired: ResolvedPolicy[] = [];
    const suppressed: SuppressedPolicyCandidate[] = [];
    const categoryDecisions: Array<{
      categoryId: string;
      name: string;
      cardinality: "ONE" | "MANY";
      winnerPolicyIds: string[];
      suppressedPolicyIds: string[];
    }> = [];
    for (const [categoryId, bucket] of allByCategory) {
      const category = categoryById.get(categoryId)!;
      bucket.manual.sort((a, b) => a.policyId.localeCompare(b.policyId));
      bucket.automatic.sort((a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        a.policyId.localeCompare(b.policyId) ||
        (a.winningRuleId ?? "").localeCompare(b.winningRuleId ?? ""),
      );
      const candidates = [...bucket.manual, ...bucket.automatic.filter((auto) => !bucket.manual.some((manual) => manual.policyId === auto.policyId))];
      const winners = category.cardinality === "ONE" ? candidates.slice(0, 1) : candidates;
      desired.push(...winners);
      for (const loser of candidates.slice(winners.length)) {
        suppressed.push({
          ...loser,
          reason: bucket.manual.length > 0 && loser.source === "rule" ? "manual_override" : "category_cardinality",
        });
      }
      categoryDecisions.push({
        categoryId,
        name: category.name,
        cardinality: category.cardinality,
        winnerPolicyIds: winners.map((winner) => winner.policyId),
        suppressedPolicyIds: candidates
          .slice(winners.length)
          .map((candidate) => candidate.policyId),
      });
    }

    return {
      employeeId,
      businessId,
      evaluationDate: asOfDate,
      intervalSemantics: "effectiveFrom <= asOf < effectiveTo",
      desiredPolicies: desired,
      suppressedCandidates: suppressed,
      evaluatedRules,
      categoryDecisions,
    };
  };

  return { resolvePoliciesForEmployee };
};

export type PolicyResolver = ReturnType<typeof createPolicyResolver>;
