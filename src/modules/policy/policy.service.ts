import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";
import type { PolicyRuleCondition } from "../policy-rule/policy-rule.model.js";
import { isOperatorAllowedForField } from "../policy-rule/rule-evaluator.js";
import type { PolicyAuditService } from "../policy-audit/policy-audit.service.js";
import type { PolicyRepository } from "./policy.repository.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { Types } from "mongoose";
import { githubTarget } from "../github-integration/github-integration.types.js";

type Dependencies = {
  repository: PolicyRepository;
  auditService: PolicyAuditService;
  businessMemberRepository: BusinessMemberRepository;
  employeeListRepository: EmployeeListRepository;
  employeeTypeRepository: EmployeeTypeRepository;
  employeeGroupRepository: EmployeeGroupRepository;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
  validateExternalTarget?: (businessId: string, target: NonNullable<ReturnType<typeof githubTarget>>) => Promise<void>;
};

const id = (value: unknown) => String(value);
const json = (document: { toObject: () => unknown }) => document.toObject();
const comparable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    if ("toHexString" in value && typeof value.toHexString === "function") {
      return value.toHexString();
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, comparable(nested)]),
    );
  }
  return value;
};
const hasMeaningfulChanges = (
  existing: object,
  updates: Record<string, unknown>,
) => {
  const current =
    "toObject" in existing && typeof existing.toObject === "function"
      ? (existing.toObject() as Record<string, unknown>)
      : (existing as Record<string, unknown>);
  return Object.entries(updates).some(
    ([key, value]) =>
      JSON.stringify(comparable(current[key])) !==
      JSON.stringify(comparable(value)),
  );
};
const assertEffectiveRange = (
  from: unknown,
  to: unknown,
  createHttpError: (message: string, statusCode: number) => HttpError,
) => {
  if (from instanceof Date && to instanceof Date && from >= to) {
    throw createHttpError("effectiveFrom must be before effectiveTo", 400);
  }
};

export const createPolicyService = ({
  repository,
  auditService,
  businessMemberRepository,
  employeeListRepository,
  employeeTypeRepository,
  employeeGroupRepository,
  withTransaction,
  createHttpError,
  validateExternalTarget,
}: Dependencies) => {
  const actor = async (businessId: string, userId: string) => {
    const member = await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, userId);
    if (!member) throw createHttpError("Active business membership is required", 403);
    return { actorType: "user" as const, actorUserId: userId, actorBusinessMemberId: member.id };
  };

  const enqueue = async (job: Parameters<typeof enqueuePolicyReconciliation>[0]) => {
    try {
      return await enqueuePolicyReconciliation(job);
    } catch (error) {
      console.error("Failed to enqueue policy reconciliation", { type: job.type, businessId: "businessId" in job ? job.businessId : undefined, error });
      return null;
    }
  };

  const createCategory = async (businessId: string, userId: string, input: { name: string; description?: string | null; cardinality: "ONE" | "MANY" }) => {
    const auditActor = await actor(businessId, userId);
    return withTransaction(async (session) => {
      const category = await repository.createCategory({ businessId, ...input, createdBy: userId }, { session });
      await auditService.record({ ...auditActor, businessId, entityType: "policy_category", entityId: category.id, categoryId: category.id, action: "CATEGORY_CREATED", after: json(category) }, session);
      return { category };
    });
  };

  const updateCategory = async (businessId: string, categoryId: string, userId: string, updates: { name?: string; description?: string | null; cardinality?: "ONE" | "MANY"; status?: "active" | "archived" }) => {
    const auditActor = await actor(businessId, userId);
    const result = await withTransaction(async (session) => {
      const existing = await repository.findCategory(businessId, categoryId, { session });
      if (!existing) throw createHttpError("Policy category not found", 404);
      if (!hasMeaningfulChanges(existing, updates)) {
        return { category: existing, changed: false };
      }
      const category = await repository.updateCategory(businessId, categoryId, { $set: updates }, { session });
      if (!category) throw createHttpError("Policy category not found", 404);
      const action = updates.status === "archived" ? "CATEGORY_ARCHIVED" : "CATEGORY_UPDATED";
      await auditService.record({ ...auditActor, businessId, entityType: "policy_category", entityId: categoryId, categoryId, action, before: json(existing), after: json(category), changedFields: Object.keys(updates) }, session);
      return { category, changed: true };
    });
    if (result.changed) await enqueue({ type: "RECONCILE_CATEGORY", businessId, categoryId, reason: "policy.category.changed", requestedBy: userId, requestedAt: new Date().toISOString() });
    return result;
  };

  const listCategories = async (businessId: string, page: number, limit: number, status?: string) => {
    const { items, total } = await repository.listCategories(businessId, page, limit, status);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  };

  const getCategory = async (businessId: string, categoryId: string) => {
    const category = await repository.findCategory(businessId, categoryId);
    if (!category) throw createHttpError("Policy category not found", 404);
    return { category };
  };

  const createPolicy = async (businessId: string, userId: string, input: { categoryId: string; name: string; description?: string | null; configuration?: Record<string, unknown>; effectiveFrom?: Date | null; effectiveTo?: Date | null }) => {
    const auditActor = await actor(businessId, userId);
    const target = githubTarget(input.configuration);
    if (target && validateExternalTarget) await validateExternalTarget(businessId, target);
    return withTransaction(async (session) => {
      const category = await repository.findCategory(businessId, input.categoryId, { session });
      if (!category || category.status !== "active") throw createHttpError("Active policy category not found in this business", 400);
      const policy = await repository.createPolicy({ businessId, ...input, createdBy: userId, updatedBy: userId }, { session });
      await auditService.record({ ...auditActor, businessId, entityType: "policy", entityId: policy.id, policyId: policy.id, categoryId: input.categoryId, action: "POLICY_CREATED", after: json(policy) }, session);
      return { policy };
    });
  };

  const updatePolicy = async (businessId: string, policyId: string, userId: string, updates: Record<string, unknown>, action = "POLICY_UPDATED") => {
    const auditActor = await actor(businessId, userId);
    const target = githubTarget(updates.configuration);
    if (target && validateExternalTarget) await validateExternalTarget(businessId, target);
    const result = await withTransaction(async (session) => {
      const existing = await repository.findPolicy(businessId, policyId, { session });
      if (!existing) throw createHttpError("Policy not found", 404);
      assertEffectiveRange(
        updates.effectiveFrom === undefined ? existing.effectiveFrom : updates.effectiveFrom,
        updates.effectiveTo === undefined ? existing.effectiveTo : updates.effectiveTo,
        createHttpError,
      );
      if (typeof updates.categoryId === "string") {
        const category = await repository.findCategory(businessId, updates.categoryId, { session });
        if (!category || category.status !== "active") throw createHttpError("Active policy category not found in this business", 400);
      }
      if (updates.status === "active") {
        const categoryId = typeof updates.categoryId === "string"
          ? updates.categoryId
          : id(existing.categoryId);
        const category = await repository.findCategory(businessId, categoryId, { session });
        if (!category || category.status !== "active") {
          throw createHttpError("An active policy requires an active category", 400);
        }
      }
      if (!hasMeaningfulChanges(existing, updates)) {
        return { policy: existing, changed: false };
      }
      const policy = await repository.updatePolicy(businessId, policyId, { $set: { ...updates, updatedBy: userId }, $inc: { version: 1 } }, { session });
      if (!policy) throw createHttpError("Policy not found", 404);
      await auditService.record({ ...auditActor, businessId, entityType: "policy", entityId: policyId, policyId, categoryId: id(policy.categoryId), action, before: json(existing), after: json(policy), changedFields: Object.keys(updates) }, session);
      return { policy, changed: true };
    });
    if (result.changed) await enqueue({ type: "RECONCILE_POLICY", businessId, policyId, policyVersion: result.policy.version, reason: `policy.${action.toLowerCase()}`, requestedBy: userId, requestedAt: new Date().toISOString() });
    return result;
  };

  const listPolicies = async (businessId: string, page: number, limit: number, categoryId?: string, status?: string) => {
    const { items, total } = await repository.listPolicies(businessId, page, limit, categoryId, status);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  };
  const getPolicy = async (businessId: string, policyId: string) => {
    const policy = await repository.findPolicy(businessId, policyId);
    if (!policy) throw createHttpError("Policy not found", 404);
    return { policy };
  };

  const referenceIds = (condition: PolicyRuleCondition) => Array.isArray(condition.value) ? condition.value.map(id) : [id(condition.value)];
  const normalizeConditions = (conditions: PolicyRuleCondition[]) =>
    conditions.map((condition) => {
      if (condition.field === "state" || condition.field === "status" || condition.field === "tenure") return condition;
      return {
        ...condition,
        value: Array.isArray(condition.value)
          ? condition.value.map((value) => new Types.ObjectId(id(value)))
          : new Types.ObjectId(id(condition.value)),
      } as PolicyRuleCondition;
    });
  const validateConditions = async (businessId: string, conditions: PolicyRuleCondition[]) => {
    for (const condition of conditions) {
      if (!isOperatorAllowedForField(condition.field, condition.operator)) throw createHttpError(`Operator ${condition.operator} is not allowed for ${condition.field}`, 400);
      if (condition.field === "tenure") {
        if (!Number.isFinite(Number(condition.value)) || Number(condition.value) < 0) throw createHttpError("Tenure must be a non-negative number of months", 400);
        continue;
      }
      if (condition.field === "state" || condition.field === "status") continue;
      const ids = referenceIds(condition);
      if (condition.field === "department") {
        const records = await Promise.all(ids.map((value) => employeeListRepository.findEmployeeListByBusinessAndId(businessId, value)));
        if (records.some((record) => !record || record.status !== "active")) throw createHttpError("Rule references an invalid or archived department", 400);
      } else if (condition.field === "employeeType") {
        const records = await Promise.all(ids.map((value) => employeeTypeRepository.findActiveByBusinessAndId(businessId, value)));
        if (records.some((record) => !record)) throw createHttpError("Rule references an invalid or archived employee type", 400);
      } else {
        const groups = await employeeGroupRepository.findActiveByBusinessAndIds(businessId, ids);
        if (groups.length !== new Set(ids).size) throw createHttpError("Rule references an invalid or archived employee group", 400);
      }
    }
  };

  const createRule = async (businessId: string, policyId: string, userId: string, input: { name?: string; conditions: PolicyRuleCondition[]; priority: number; effectiveFrom?: Date | null; effectiveTo?: Date | null }) => {
    await validateConditions(businessId, input.conditions);
    const auditActor = await actor(businessId, userId);
    const result = await withTransaction(async (session) => {
      const policy = await repository.findPolicy(businessId, policyId, { session });
      if (!policy || policy.status === "archived") throw createHttpError("Policy not found or archived in this business", 400);
      const rule = await repository.createRule({ businessId, policyId, ...input, conditions: normalizeConditions(input.conditions), createdBy: userId, updatedBy: userId }, { session });
      await auditService.record({ ...auditActor, businessId, entityType: "policy_rule", entityId: rule.id, policyRuleId: rule.id, policyId, categoryId: id(policy.categoryId), action: "RULE_CREATED", after: json(rule) }, session);
      return { rule, policyVersion: policy.version };
    });
    await enqueue({ type: "RECONCILE_POLICY", businessId, policyId, policyVersion: result.policyVersion, reason: "policy.rule.created", requestedBy: userId, requestedAt: new Date().toISOString() });
    return { rule: result.rule };
  };

  const updateRule = async (businessId: string, ruleId: string, userId: string, updates: Record<string, unknown>, action = "RULE_UPDATED") => {
    if (Array.isArray(updates.conditions)) await validateConditions(businessId, updates.conditions as PolicyRuleCondition[]);
    const auditActor = await actor(businessId, userId);
    const result = await withTransaction(async (session) => {
      const existing = await repository.findRule(businessId, ruleId, { session });
      if (!existing) throw createHttpError("Policy rule not found", 404);
      assertEffectiveRange(
        updates.effectiveFrom === undefined ? existing.effectiveFrom : updates.effectiveFrom,
        updates.effectiveTo === undefined ? existing.effectiveTo : updates.effectiveTo,
        createHttpError,
      );
      if (!hasMeaningfulChanges(existing, updates)) {
        const policy = await repository.findPolicy(businessId, id(existing.policyId), { session });
        return { rule: existing, policyVersion: policy?.version ?? 1, changed: false };
      }
      const normalizedUpdates = Array.isArray(updates.conditions)
        ? { ...updates, conditions: normalizeConditions(updates.conditions as PolicyRuleCondition[]) }
        : updates;
      const rule = await repository.updateRule(businessId, ruleId, { $set: { ...normalizedUpdates, updatedBy: userId }, $inc: { version: 1 } }, { session });
      if (!rule) throw createHttpError("Policy rule not found", 404);
      const policy = await repository.findPolicy(businessId, id(rule.policyId), { session });
      const auditAction = action === "RULE_UPDATED" && "priority" in updates
        ? "RULE_PRIORITY_CHANGED"
        : action;
      await auditService.record({ ...auditActor, businessId, entityType: "policy_rule", entityId: ruleId, policyRuleId: ruleId, policyId: id(rule.policyId), categoryId: policy ? id(policy.categoryId) : undefined, action: auditAction, before: json(existing), after: json(rule), changedFields: Object.keys(updates) }, session);
      return { rule, policyVersion: policy?.version ?? 1, changed: true };
    });
    if (result.changed) await enqueue({ type: "RECONCILE_POLICY", businessId, policyId: id(result.rule.policyId), policyVersion: result.policyVersion, reason: `policy.rule.${action.toLowerCase()}`, requestedBy: userId, requestedAt: new Date().toISOString() });
    return { rule: result.rule };
  };

  const listRules = async (businessId: string, policyId: string) => {
    await getPolicy(businessId, policyId);
    const items = await repository.listRules(businessId, policyId);
    const referenceIdsByField = (field: PolicyRuleCondition["field"]) =>
      [...new Set(items.flatMap((rule) => rule.conditions
        .filter((condition) => condition.field === field)
        .flatMap((condition) => Array.isArray(condition.value) ? condition.value : [condition.value])
        .map(id)))];
    const [departments, employeeTypes, groups] = await Promise.all([
      employeeListRepository.findEmployeeListsByBusinessAndIds(businessId, referenceIdsByField("department")),
      employeeTypeRepository.findByBusinessAndIds(businessId, referenceIdsByField("employeeType")),
      employeeGroupRepository.findByBusinessAndIds(businessId, referenceIdsByField("group")),
    ]);
    const namesById = (records: Array<{ id?: unknown; _id?: unknown; name: string }>) =>
      new Map(records.map((record) => [id(record.id ?? record._id), record.name]));
    const names = {
      department: namesById(departments as never),
      employeeType: namesById(employeeTypes as never),
      group: namesById(groups as never),
    };
    const resolvedItems = items.map((rule) => ({
      ...rule.toObject(),
      id: rule.id,
      conditions: rule.conditions.map((condition) => {
        const lookup = names[condition.field as keyof typeof names];
        if (!lookup) return condition;
        const values = Array.isArray(condition.value) ? condition.value : [condition.value];
        const displayValue = values.map((value) => lookup.get(id(value)) ?? "Reference unavailable");
        return { ...condition, displayValue: Array.isArray(condition.value) ? displayValue : displayValue[0] };
      }),
    }));
    return { items: resolvedItems };
  };
  const getRule = async (businessId: string, ruleId: string) => {
    const rule = await repository.findRule(businessId, ruleId);
    if (!rule) throw createHttpError("Policy rule not found", 404);
    return { rule };
  };

  return { actor, createCategory, createPolicy, createRule, getCategory, getPolicy, getRule, listCategories, listPolicies, listRules, updateCategory, updatePolicy, updateRule };
};

export type PolicyService = ReturnType<typeof createPolicyService>;
