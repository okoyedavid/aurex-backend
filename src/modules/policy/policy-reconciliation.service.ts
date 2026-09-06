import crypto from "node:crypto";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import type { PolicyAuditActor, PolicyAuditService } from "../policy-audit/policy-audit.service.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { PolicyRepository } from "./policy.repository.js";
import type { PolicyResolver } from "./policy-resolver.service.js";
import { isEffectiveAt } from "./policy-effective.js";

type Dependencies = {
  repository: PolicyRepository;
  employeeRepository: EmployeeRepository;
  resolver: PolicyResolver;
  auditService: PolicyAuditService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const id = (value: unknown) => String(value);

export const createPolicyReconciliationService = ({
  repository,
  employeeRepository,
  resolver,
  auditService,
  withTransaction,
  createHttpError,
}: Dependencies) => {
  const reconcileEmployeePolicies = async ({
    businessId,
    employeeId,
    asOfDate,
    reason,
    actor,
    correlationId,
    triggeredByUserId,
  }: {
    businessId: string;
    employeeId: string;
    asOfDate: Date;
    reason: string;
    actor: PolicyAuditActor;
    correlationId?: string;
    triggeredByUserId?: string;
  }) => {
    const resolution = await resolver.resolvePoliciesForEmployee({ businessId, employeeId, asOfDate });
    const reconciliationRunId = crypto.randomUUID();
    const result = await withTransaction(async (session) => {
      const current = await repository.findAssignmentsAsOf(businessId, employeeId, asOfDate, { session });
      const currentByPolicy = new Map(current.map((assignment) => [id(assignment.policyId), assignment]));
      const desiredIds = new Set(resolution.desiredPolicies.map((candidate) => candidate.policyId));
      const changes: Array<{ operation: "KEEP" | "CREATE" | "END" | "UPDATE_VERSION"; policyId: string; assignmentId: string; previousAssignmentId?: string }> = [];

      for (const desired of resolution.desiredPolicies) {
        const existing = currentByPolicy.get(desired.policyId);
        if (existing) {
          const existingRuleIds = (existing.matchedRuleIds ?? []).map(id).sort();
          const desiredRuleIds = [...desired.matchedRuleIds].sort();
          const needsUpdate =
            existing.policyVersion !== desired.policyVersion ||
            id(existing.categoryId) !== desired.categoryId ||
            id(existing.winningRuleId ?? "") !== (desired.winningRuleId ?? "") ||
            existing.source !== desired.source ||
            JSON.stringify(existingRuleIds) !== JSON.stringify(desiredRuleIds);
          if (!needsUpdate) {
            changes.push({ operation: "KEEP", policyId: desired.policyId, assignmentId: existing.id });
            continue;
          }
          const before = existing.toObject();
          const ended = await repository.updateAssignment(existing.id, { $set: {
            status: "ended",
            effectiveTo: asOfDate,
            resolvedAt: asOfDate,
          } }, { session });
          if (!ended) throw new Error("Assignment disappeared during reconciliation");
          const replacement = await repository.createAssignment({
            businessId,
            employeeId,
            policyId: desired.policyId,
            categoryId: desired.categoryId,
            policyVersion: desired.policyVersion,
            source: desired.source,
            winningRuleId: desired.winningRuleId,
            matchedRuleIds: desired.matchedRuleIds,
            status: "active",
            effectiveFrom: asOfDate,
            resolvedAt: asOfDate,
            ...(existing.createdBy ? { createdBy: existing.createdBy } : {}),
          }, { session });
          await auditService.record({ ...actor, businessId, entityType: desired.source === "manual" ? "manual_assignment" : "employee_policy_assignment", entityId: replacement.id, employeeId, policyId: desired.policyId, policyRuleId: desired.winningRuleId ?? undefined, categoryId: desired.categoryId, action: "ASSIGNMENT_VERSION_UPDATED", before, after: replacement.toObject(), changedFields: ["policyVersion", "categoryId", "source", "winningRuleId", "matchedRuleIds", "status", "effectiveFrom", "effectiveTo", "resolvedAt"], reason, correlationId, reconciliationRunId, metadata: { previousAssignmentId: existing.id, conditionEvaluations: desired.conditionEvaluations, triggeredByUserId } }, session);
          changes.push({ operation: "UPDATE_VERSION", policyId: desired.policyId, assignmentId: replacement.id, previousAssignmentId: existing.id });
          continue;
        }

        const assignment = await repository.createAssignment({
          businessId,
          employeeId,
          policyId: desired.policyId,
          categoryId: desired.categoryId,
          policyVersion: desired.policyVersion,
          source: desired.source,
          winningRuleId: desired.winningRuleId,
          matchedRuleIds: desired.matchedRuleIds,
          status: "active",
          effectiveFrom: asOfDate,
          resolvedAt: asOfDate,
        }, { session });
        await auditService.record({ ...actor, businessId, entityType: "employee_policy_assignment", entityId: assignment.id, employeeId, policyId: desired.policyId, policyRuleId: desired.winningRuleId ?? undefined, categoryId: desired.categoryId, action: "ASSIGNMENT_CREATED", after: assignment.toObject(), reason, correlationId, reconciliationRunId, metadata: { conditionEvaluations: desired.conditionEvaluations, triggeredByUserId } }, session);
        changes.push({ operation: "CREATE", policyId: desired.policyId, assignmentId: assignment.id });
      }

      for (const assignment of current) {
        if (desiredIds.has(id(assignment.policyId))) continue;
        const ended = await repository.updateAssignment(assignment.id, { $set: { status: "ended", effectiveTo: asOfDate, resolvedAt: asOfDate } }, { session });
        if (!ended) throw new Error("Assignment disappeared during reconciliation");
        await auditService.record({ ...actor, businessId, entityType: assignment.source === "manual" ? "manual_assignment" : "employee_policy_assignment", entityId: ended.id, employeeId, policyId: id(assignment.policyId), categoryId: id(assignment.categoryId), action: assignment.source === "manual" ? "MANUAL_ASSIGNMENT_ENDED" : "ASSIGNMENT_ENDED", before: assignment.toObject(), after: ended.toObject(), changedFields: ["status", "effectiveTo", "resolvedAt"], reason, correlationId, reconciliationRunId, metadata: { triggeredByUserId } }, session);
        changes.push({ operation: "END", policyId: id(assignment.policyId), assignmentId: ended.id });
      }
      return changes;
    });

    console.info("Policy reconciliation completed", { businessId, employeeId, reconciliationRunId, reason, assignmentsCreated: result.filter((item) => item.operation === "CREATE" || item.operation === "UPDATE_VERSION").length, assignmentsEnded: result.filter((item) => item.operation === "END" || item.operation === "UPDATE_VERSION").length });
    return { resolution, reconciliationRunId, changes: result };
  };

  const createManualAssignment = async ({ businessId, employeeId, policyId, userId, businessMemberId, effectiveFrom }: { businessId: string; employeeId: string; policyId: string; userId: string; businessMemberId: string; effectiveFrom: Date }) => {
    const [employee, policy] = await Promise.all([
      employeeRepository.findByIdAndBusiness(employeeId, businessId),
      repository.findPolicy(businessId, policyId),
    ]);
    if (!employee) throw createHttpError("Employee not found in this business", 404);
    if (!policy || policy.status !== "active") throw createHttpError("Active policy not found in this business", 400);
    if (!isEffectiveAt(policy.effectiveFrom, policy.effectiveTo, effectiveFrom)) {
      throw createHttpError("Policy is not effective on the manual assignment date", 400);
    }
    const category = await repository.findCategory(businessId, id(policy.categoryId));
    if (!category || category.status !== "active") throw createHttpError("Active policy category not found", 400);
    const existing = await repository.findActiveManualAssignment(businessId, employeeId, policyId);
    if (existing) return { assignment: existing, created: false };

    const assignment = await withTransaction(async (session) => {
      const current = await repository.findAssignmentsAsOf(businessId, employeeId, effectiveFrom, { session });
      if (category.cardinality === "ONE") {
        for (const item of current.filter((candidate) => id(candidate.categoryId) === category.id)) {
          const ended = await repository.updateAssignment(item.id, { $set: { status: "ended", effectiveTo: effectiveFrom, resolvedAt: effectiveFrom } }, { session });
          if (ended) await auditService.record({ actorType: "user", actorUserId: userId, actorBusinessMemberId: businessMemberId, businessId, entityType: item.source === "manual" ? "manual_assignment" : "employee_policy_assignment", entityId: item.id, employeeId, policyId: id(item.policyId), categoryId: category.id, action: item.source === "manual" ? "MANUAL_ASSIGNMENT_ENDED" : "ASSIGNMENT_ENDED", before: item.toObject(), after: ended.toObject(), reason: "manual_assignment.precedence" }, session);
        }
      } else {
        const samePolicy = current.find((item) => id(item.policyId) === policyId);
        if (samePolicy) {
          const ended = await repository.updateAssignment(samePolicy.id, { $set: { status: "ended", effectiveTo: effectiveFrom, resolvedAt: effectiveFrom } }, { session });
          if (ended) await auditService.record({ actorType: "user", actorUserId: userId, actorBusinessMemberId: businessMemberId, businessId, entityType: "employee_policy_assignment", entityId: samePolicy.id, employeeId, policyId, categoryId: category.id, action: "ASSIGNMENT_ENDED", before: samePolicy.toObject(), after: ended.toObject(), reason: "manual_assignment.replaced_automatic" }, session);
        }
      }
      const created = await repository.createAssignment({ businessId, employeeId, policyId, categoryId: category.id, policyVersion: policy.version, source: "manual", winningRuleId: null, matchedRuleIds: [], status: "active", effectiveFrom, resolvedAt: effectiveFrom, createdBy: userId }, { session });
      await auditService.record({ actorType: "user", actorUserId: userId, actorBusinessMemberId: businessMemberId, businessId, entityType: "manual_assignment", entityId: created.id, employeeId, policyId, categoryId: category.id, action: "MANUAL_ASSIGNMENT_CREATED", after: created.toObject() }, session);
      return created;
    });
    return { assignment, created: true };
  };

  const endManualAssignment = async ({ businessId, employeeId, policyId, userId, businessMemberId, effectiveTo }: { businessId: string; employeeId: string; policyId: string; userId: string; businessMemberId: string; effectiveTo: Date }) => {
    const existing = await repository.findActiveManualAssignment(businessId, employeeId, policyId);
    if (!existing) throw createHttpError("Active manual assignment not found", 404);
    const assignment = await withTransaction(async (session) => {
      const ended = await repository.updateAssignment(existing.id, { $set: { status: "ended", effectiveTo, resolvedAt: effectiveTo } }, { session });
      if (!ended) throw createHttpError("Active manual assignment not found", 404);
      await auditService.record({ actorType: "user", actorUserId: userId, actorBusinessMemberId: businessMemberId, businessId, entityType: "manual_assignment", entityId: ended.id, employeeId, policyId, categoryId: id(ended.categoryId), action: "MANUAL_ASSIGNMENT_ENDED", before: existing.toObject(), after: ended.toObject() }, session);
      return ended;
    });
    return { assignment };
  };

  const getAssignments = async (businessId: string, employeeId: string, asOf: Date) => {
    const assignments = await repository.findAssignmentsAsOf(businessId, employeeId, asOf);
    const ruleIds = [...new Set(assignments.flatMap((assignment) =>
      assignment.source === "manual"
        ? []
        : [
            ...(assignment.winningRuleId ? [id(assignment.winningRuleId)] : []),
            ...(assignment.matchedRuleIds ?? []).map(id),
          ],
    ))];
    const rules = ruleIds.length ? await repository.findRulesByIds(businessId, ruleIds) : [];
    const rulesById = new Map(rules.map((rule) => [rule.id, { id: rule.id, name: rule.name ?? null }]));

    return assignments.map((assignment) => {
      const value = typeof assignment.toJSON === "function"
        ? assignment.toJSON()
        : assignment.toObject();
      if (assignment.source === "manual") {
        return { ...value, winningRule: null, matchedRules: [] };
      }
      const winningRule = assignment.winningRuleId
        ? rulesById.get(id(assignment.winningRuleId)) ?? null
        : null;
      const matchedRules = (assignment.matchedRuleIds ?? [])
        .map((ruleId) => rulesById.get(id(ruleId)))
        .filter((rule): rule is { id: string; name: string | null } => Boolean(rule));
      return { ...value, winningRule, matchedRules };
    });
  };

  return { createManualAssignment, endManualAssignment, getAssignments, reconcileEmployeePolicies };
};

export type PolicyReconciliationService = ReturnType<typeof createPolicyReconciliationService>;
