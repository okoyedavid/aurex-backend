import type { HttpError } from "../../utils/api-error.js";
import type { AuditEventRepository, BusinessAuditFilters } from "../audit-event/audit-event.repository.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { PolicyAuditRepository } from "../policy-audit/policy-audit.repository.js";
import { mapGeneralAuditEvent, mapPolicyAuditEvent, type AuditFeedItem } from "./audit-feed.dto.js";

type Role = { permissions?: string[]; deniedPermissions?: string[] };
type ListInput = Omit<BusinessAuditFilters, "domain"> & {
  businessId: string;
  userId: string;
  page: number;
  limit: number;
  domain?: BusinessAuditFilters["domain"] | "policy";
};

const effectivePermissions = (role: Role) => {
  const denied = new Set(role.deniedPermissions ?? []);
  return new Set((role.permissions ?? []).filter((permission) => !denied.has(permission)));
};

const timestamp = (item: AuditFeedItem) => new Date(item.occurredAt as string | Date).getTime();

export const createAuditFeedService = ({
  auditEventRepository,
  policyAuditRepository,
  businessMemberRepository,
  employeeRepository,
  createHttpError,
}: {
  auditEventRepository: AuditEventRepository;
  policyAuditRepository: PolicyAuditRepository;
  businessMemberRepository: BusinessMemberRepository;
  employeeRepository: EmployeeRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
}) => {
  const membership = async (businessId: string, userId: string) => {
    const member = await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, userId);
    if (!member) throw createHttpError("Active business membership is required", 403);
    return member;
  };

  const paginated = (items: AuditFeedItem[], page: number, limit: number, total: number) => ({
    items: items.sort((left, right) => timestamp(right) - timestamp(left)).slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });

  const listBusinessAudit = async (input: ListInput) => {
    const member = await membership(input.businessId, input.userId);
    const permissions = effectivePermissions(member.roleId as unknown as Role);
    if (!permissions.has("audit_logs:view")) throw createHttpError("Missing required permission: audit_logs:view", 403);

    const canViewPolicy = permissions.has("policies:view_audit");
    const wantsPolicy = !input.domain || input.domain === "policy";
    const wantsGeneral = input.domain !== "policy";
    const window = input.page * input.limit;
    const generalFilters: BusinessAuditFilters = {
      action: input.action,
      actorId: input.actorId,
      employeeId: input.employeeId,
      from: input.from,
      to: input.to,
      ...(input.domain && input.domain !== "policy" ? { domain: input.domain } : {}),
    };
    const [generalItems, generalTotal, policyResult] = await Promise.all([
      wantsGeneral ? auditEventRepository.listBusinessAuditEvents(input.businessId, generalFilters, window) : [],
      wantsGeneral ? auditEventRepository.countBusinessAuditEvents(input.businessId, generalFilters) : 0,
      canViewPolicy && wantsPolicy
        ? policyAuditRepository.listAudits(input.businessId, {
            action: input.action,
            employeeId: input.employeeId,
            actorBusinessMemberId: input.actorId,
            from: input.from,
            to: input.to,
          }, 1, window)
        : { items: [], total: 0 },
    ]);
    return paginated([
      ...generalItems.map(mapGeneralAuditEvent),
      ...policyResult.items.map((item: unknown) => mapPolicyAuditEvent(item)),
    ], input.page, input.limit, generalTotal + policyResult.total);
  };

  const listPersonalAudit = async ({ businessId, userId, page, limit }: Pick<ListInput, "businessId" | "userId" | "page" | "limit">) => {
    const member = await membership(businessId, userId);
    const memberId = String(member.id);
    const employee = await employeeRepository.findByBusinessMember(businessId, memberId);
    const employeeId = employee ? String(employee.id) : undefined;
    const window = page * limit;
    const [generalItems, generalTotal, policyItems, policyTotal] = await Promise.all([
      auditEventRepository.listPersonalAuditEvents(businessId, memberId, employeeId, window),
      auditEventRepository.countPersonalAuditEvents(businessId, memberId, employeeId),
      employeeId ? policyAuditRepository.listPersonalAudits(businessId, employeeId, window) : [],
      employeeId ? policyAuditRepository.countPersonalAudits(businessId, employeeId) : 0,
    ]);
    return paginated([
      ...generalItems.map(mapGeneralAuditEvent),
      ...policyItems.map((item: unknown) => mapPolicyAuditEvent(item, true)),
    ], page, limit, generalTotal + policyTotal);
  };

  return { listBusinessAudit, listPersonalAudit };
};

export type AuditFeedService = ReturnType<typeof createAuditFeedService>;
