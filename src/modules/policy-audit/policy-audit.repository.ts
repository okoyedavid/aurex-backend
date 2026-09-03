import type { ClientSession, QueryFilter } from "mongoose";
import { PolicyAudit, type PolicyAuditDocument } from "./policy-audit.model.js";

type AuditFilters = {
  entityType?: string;
  entityId?: string;
  employeeId?: string;
  policyId?: string;
  ruleId?: string;
  categoryId?: string;
  actorUserId?: string;
  actorBusinessMemberId?: string;
  action?: string;
  from?: Date;
  to?: Date;
};

export const personalPolicyAuditActions = [
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_VERSION_UPDATED",
  "ASSIGNMENT_ENDED",
  "MANUAL_ASSIGNMENT_CREATED",
  "MANUAL_ASSIGNMENT_ENDED",
] as const;

const createAudit = (payload: Record<string, unknown>, session?: ClientSession) =>
  PolicyAudit.create([payload], { session }).then(([item]) => item!);

const listAudits = async (businessId: string, filters: AuditFilters, page: number, limit: number) => {
  const query: QueryFilter<PolicyAuditDocument> = { businessId };
  if (filters.entityType) query.entityType = filters.entityType as PolicyAuditDocument["entityType"];
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.policyId) query.policyId = filters.policyId;
  if (filters.ruleId) query.policyRuleId = filters.ruleId;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.actorUserId) query.actorUserId = filters.actorUserId;
  if (filters.actorBusinessMemberId) query.actorBusinessMemberId = filters.actorBusinessMemberId;
  if (filters.action) query.action = filters.action;
  if (filters.from || filters.to) {
    query.occurredAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lt: filters.to } : {}) };
  }
  const [items, total] = await Promise.all([
    PolicyAudit.find(query)
      .populate("policyId", "name")
      .populate("employeeId", "fullName")
      .populate({ path: "actorBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
      .sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    PolicyAudit.countDocuments(query),
  ]);
  return { items, total };
};

const personalQuery = (businessId: string, employeeId: string): QueryFilter<PolicyAuditDocument> => ({
  businessId,
  employeeId,
  entityType: { $in: ["employee_policy_assignment", "manual_assignment"] },
  action: { $in: personalPolicyAuditActions },
});

const listPersonalAudits = (businessId: string, employeeId: string, limit: number) =>
  PolicyAudit.find(personalQuery(businessId, employeeId))
    .populate("policyId", "name")
    .populate("employeeId", "fullName")
    .populate({ path: "actorBusinessMemberId", select: "userId", populate: { path: "userId", select: "name" } })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit);

const countPersonalAudits = (businessId: string, employeeId: string) =>
  PolicyAudit.countDocuments(personalQuery(businessId, employeeId));

export const policyAuditRepository = {
  countPersonalAudits,
  createAudit,
  listAudits,
  listPersonalAudits,
};
export type PolicyAuditRepository = typeof policyAuditRepository;
