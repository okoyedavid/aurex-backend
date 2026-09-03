import type { ClientSession } from "mongoose";
import type { PolicyAuditRepository } from "./policy-audit.repository.js";
import { mapPolicyAuditEvent } from "../audit-feed/audit-feed.dto.js";

export type PolicyAuditActor = {
  actorType: "user" | "system" | "worker";
  actorUserId?: string | null;
  actorBusinessMemberId?: string | null;
};

type RecordPolicyAudit = PolicyAuditActor & {
  businessId: string;
  entityType:
    | "policy_category"
    | "policy"
    | "policy_rule"
    | "employee_policy_assignment"
    | "manual_assignment"
    | "reconciliation";
  entityId: string;
  action: string;
  employeeId?: string;
  policyId?: string;
  policyRuleId?: string;
  categoryId?: string;
  before?: unknown;
  after?: unknown;
  changedFields?: string[];
  reason?: string;
  metadata?: unknown;
  correlationId?: string;
  reconciliationRunId?: string;
};

export const createPolicyAuditService = (repository: PolicyAuditRepository) => {
  const record = (payload: RecordPolicyAudit, session?: ClientSession) =>
    repository.createAudit(
      { ...payload, occurredAt: new Date() },
      session,
    );

  const list = async ({
    businessId,
    filters,
    page,
    limit,
  }: {
    businessId: string;
    filters: Parameters<PolicyAuditRepository["listAudits"]>[1];
    page: number;
    limit: number;
  }) => {
    const { items, total } = await repository.listAudits(
      businessId,
      filters,
      page,
      limit,
    );
    return {
      items: items.map((item) => mapPolicyAuditEvent(item)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  };

  return { list, record };
};

export type PolicyAuditService = ReturnType<typeof createPolicyAuditService>;
