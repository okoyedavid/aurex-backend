import type { HttpError } from "../../utils/api-error.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import type { PolicyRepository } from "./policy.repository.js";
import type { ConditionEvaluation } from "../policy-rule/rule-evaluator.js";

export type ResolvedPolicy = {
  policyId: string;
  categoryId: string;
  policyVersion: number;
  source: "rule" | "manual";
  priority: number | null;
  winningRuleId: string | null;
  winningRuleName: string | null;
  matchedRuleIds: string[];
  matchedRuleNames: string[];
  conditionEvaluations: Record<string, ConditionEvaluation[]>;
  manualAssignmentId: string | null;
};

export type SuppressedPolicyCandidate = ResolvedPolicy & {
  reason: "category_cardinality" | "manual_override";
};

export type EvaluatedPolicyRule = {
  ruleId: string;
  ruleName: string | null;
  policyId: string;
  priority: number;
  matched: boolean;
  conditions: ConditionEvaluation[];
};

export type PolicyResolution = {
  employeeId: string;
  businessId: string;
  evaluationDate: Date;
  intervalSemantics: string;
  desiredPolicies: ResolvedPolicy[];
  suppressedCandidates: SuppressedPolicyCandidate[];
  evaluatedRules: EvaluatedPolicyRule[];
  categoryDecisions: Array<{
    categoryId: string;
    name: string;
    cardinality: "ONE" | "MANY";
    winnerPolicyIds: string[];
    suppressedPolicyIds: string[];
  }>;
};

export type PolicyResolverDependencies = {
  employeeRepository: EmployeeRepository;
  policyRepository: PolicyRepository;
  employeeListRepository: EmployeeListRepository;
  employeeTypeRepository: EmployeeTypeRepository;
  employeeGroupRepository: EmployeeGroupRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};
