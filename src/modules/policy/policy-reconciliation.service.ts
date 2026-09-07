import crypto from "node:crypto";
import type { PolicyResolver } from "./policy-resolver.service.js";
import { isEffectiveAt } from "./policy-effective.js";
import { planAssignmentTransitions, type AssignmentSnapshot } from "./policy-assignment-transition.js";
import type {
  CreateManualAssignmentInput,
  EndManualAssignmentInput,
  PolicyReconciliationDependencies,
  ReconcileEmployeePoliciesInput,
} from "./policy-reconciliation.types.js";

const id = (value: unknown) => String(value);

export const createPolicyReconciliationService = ({
  repository,
  employeeRepository,
  resolver,
  auditService,
  withTransaction,
  createHttpError,
}: PolicyReconciliationDependencies) => {
  const reconcileEmployeePolicies = async ({
    businessId,
    employeeId,
    asOfDate,
    reason,
    actor,
    correlationId,
    triggeredByUserId,
  }: ReconcileEmployeePoliciesInput) => {
    const resolution = await resolver.resolvePoliciesForEmployee({ businessId, employeeId, asOfDate });
    const reconciliationRunId = crypto.randomUUID();
    const result = await withTransaction(async (session) => {
      const current = await repository.findAssignmentsAsOf(businessId, employeeId, asOfDate, { session });
      const documentsById = new Map(current.map((assignment) => [assignment.id, assignment]));
      const snapshots: AssignmentSnapshot[] = current.map((assignment) => ({
        id: assignment.id,
        policyId: id(assignment.policyId),
        categoryId: id(assignment.categoryId),
        policyVersion: assignment.policyVersion,
        source: assignment.source,
        winningRuleId: assignment.winningRuleId ? id(assignment.winningRuleId) : null,
        matchedRuleIds: (assignment.matchedRuleIds ?? []).map(id),
        status: assignment.status,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo ?? null,
        resolvedAt: assignment.resolvedAt,
        createdBy: assignment.createdBy ? id(assignment.createdBy) : null,
      }));
      const transitions = planAssignmentTransitions({ current: snapshots, desired: resolution.desiredPolicies, asOfDate });
      const changes: Array<{ operation: "KEEP" | "CREATE" | "END" | "UPDATE_VERSION"; policyId: string; assignmentId: string; previousAssignmentId?: string }> = [];

      for (const transition of transitions) {
        if (transition.operation === "KEEP") {
          changes.push({ operation: "KEEP", policyId: transition.policyId, assignmentId: transition.existing.id });
          continue;
        }
        if (transition.operation === "END" || transition.operation === "UPDATE_VERSION") {
          const existing = documentsById.get(transition.before.id)!;
          const ended = await repository.updateAssignment(existing.id, { $set: { status: "ended", effectiveTo: asOfDate, resolvedAt: asOfDate } }, { session });
          if (!ended) throw new Error("Assignment disappeared during reconciliation");
          if (transition.operation === "END") {
            await auditService.record({ ...actor, businessId, entityType: existing.source === "manual" ? "manual_assignment" : "employee_policy_assignment", entityId: ended.id, employeeId, policyId: transition.policyId, categoryId: id(existing.categoryId), action: existing.source === "manual" ? "MANUAL_ASSIGNMENT_ENDED" : "ASSIGNMENT_ENDED", before: existing.toObject(), after: ended.toObject(), changedFields: ["status", "effectiveTo", "resolvedAt"], reason, correlationId, reconciliationRunId, metadata: { triggeredByUserId } }, session);
            changes.push({ operation: "END", policyId: transition.policyId, assignmentId: ended.id });
            continue;
          }
        }
        const desired = transition.desired;
        const previous = transition.operation === "UPDATE_VERSION" ? documentsById.get(transition.before.id)! : null;
        const assignment = await repository.createAssignment({ businessId, employeeId, policyId: desired.policyId, categoryId: desired.categoryId, policyVersion: desired.policyVersion, source: desired.source, winningRuleId: desired.winningRuleId, matchedRuleIds: desired.matchedRuleIds, status: "active", effectiveFrom: asOfDate, resolvedAt: asOfDate, ...(previous?.createdBy ? { createdBy: previous.createdBy } : {}) }, { session });
        await auditService.record({ ...actor, businessId, entityType: desired.source === "manual" ? "manual_assignment" : "employee_policy_assignment", entityId: assignment.id, employeeId, policyId: desired.policyId, policyRuleId: desired.winningRuleId ?? undefined, categoryId: desired.categoryId, action: transition.operation === "UPDATE_VERSION" ? "ASSIGNMENT_VERSION_UPDATED" : "ASSIGNMENT_CREATED", ...(previous ? { before: previous.toObject() } : {}), after: assignment.toObject(), ...(previous ? { changedFields: ["policyVersion", "categoryId", "source", "winningRuleId", "matchedRuleIds", "status", "effectiveFrom", "effectiveTo", "resolvedAt"] } : {}), reason, correlationId, reconciliationRunId, metadata: { ...(previous ? { previousAssignmentId: previous.id } : {}), conditionEvaluations: desired.conditionEvaluations, triggeredByUserId } }, session);
        changes.push({ operation: transition.operation, policyId: desired.policyId, assignmentId: assignment.id, ...(previous ? { previousAssignmentId: previous.id } : {}) });
      }
      return changes;
    });

    console.info("Policy reconciliation completed", { businessId, employeeId, reconciliationRunId, reason, assignmentsCreated: result.filter((item) => item.operation === "CREATE" || item.operation === "UPDATE_VERSION").length, assignmentsEnded: result.filter((item) => item.operation === "END" || item.operation === "UPDATE_VERSION").length });
    return { resolution, reconciliationRunId, changes: result };
  };

  const createManualAssignment = async ({ businessId, employeeId, policyId, userId, businessMemberId, effectiveFrom }: CreateManualAssignmentInput) => {
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

  const endManualAssignment = async ({ businessId, employeeId, policyId, userId, businessMemberId, effectiveTo }: EndManualAssignmentInput) => {
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
