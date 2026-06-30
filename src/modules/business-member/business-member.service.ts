import type { HttpError } from "../../utils/api-error.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { RoleRepository } from "../role/role.repository.js";
import type { BusinessMemberRepository } from "./business-member.repository.js";

type CreateBusinessMemberServiceDependencies = {
  businessMemberRepository: BusinessMemberRepository;
  roleRepository: RoleRepository;
  auditEventService: AuditEventService;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

type PopulatedRole = {
  key?: string;
  name?: string;
  permissions?: string[];
  deniedPermissions?: string[];
};

const getDocumentId = (value: unknown) => {
  if (value && typeof value === "object" && "_id" in value) {
    return String(value._id);
  }

  return String(value);
};

const getUserEmail = (value: unknown) => {
  if (
    value &&
    typeof value === "object" &&
    "email" in value &&
    typeof value.email === "string"
  ) {
    return value.email;
  }

  return null;
};

const getEffectivePermissions = (role: PopulatedRole) => {
  const denied = new Set(role.deniedPermissions ?? []);
  return (role.permissions ?? []).filter((permission) => !denied.has(permission));
};

export const createBusinessMemberService = ({
  businessMemberRepository,
  roleRepository,
  auditEventService,
  createHttpError,
}: CreateBusinessMemberServiceDependencies) => {
  const listBusinessMembers = async ({
    businessId,
    page,
    limit,
  }: {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } =
      await businessMemberRepository.paginateBusinessMembersByBusinessId({
        businessId,
        page,
        limit,
      });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const getBusinessMember = async ({
    businessId,
    memberId,
  }: {
    businessId: string;
    memberId: string;
  }) => {
    const businessMember =
      await businessMemberRepository.findBusinessMemberByBusinessAndId(
        businessId,
        memberId,
      );

    if (!businessMember) {
      throw createHttpError("Business member not found", 404);
    }

    return { businessMember };
  };

  const authorizeMemberMutation = async ({
    businessId,
    memberId,
    actorUserId,
    requiredPermissions,
  }: {
    businessId: string;
    memberId: string;
    actorUserId: string;
    requiredPermissions: string[];
  }) => {
    const [actorMembership, targetMember] = await Promise.all([
      businessMemberRepository.findActiveMembershipByBusinessAndUser(
        businessId,
        actorUserId,
      ),
      businessMemberRepository.findBusinessMemberByBusinessAndId(
        businessId,
        memberId,
      ),
    ]);

    if (!actorMembership) {
      throw createHttpError("Active business membership is required", 403);
    }

    if (!targetMember) {
      throw createHttpError("Business member not found", 404);
    }

    if (targetMember.status === "removed") {
      throw createHttpError("Removed memberships cannot be modified", 409);
    }

    const targetUserId = getDocumentId(targetMember.userId);

    if (targetUserId === actorUserId) {
      throw createHttpError(
        "Use a dedicated account action to modify your own membership",
        403,
      );
    }

    const actorRole = actorMembership.roleId as unknown as PopulatedRole;
    const targetRole = targetMember.roleId as unknown as PopulatedRole;

    if (targetRole.key === "owner") {
      throw createHttpError("The Owner membership cannot be modified", 403);
    }

    const actorPermissions = new Set(getEffectivePermissions(actorRole));

    if (
      requiredPermissions.some(
        (permission) => !actorPermissions.has(permission),
      )
    ) {
      throw createHttpError("You do not have permission for this action", 403);
    }

    const targetPermissions = getEffectivePermissions(targetRole);

    if (
      targetPermissions.some((permission) => !actorPermissions.has(permission))
    ) {
      throw createHttpError(
        "You cannot manage a member with permissions you do not have",
        403,
      );
    }

    return { actorPermissions, targetMember, targetUserId };
  };

  const recordMemberEvent = async ({
    eventType,
    businessId,
    memberId,
    actorUserId,
    targetUserId,
    targetEmail,
    roleId,
    status,
    title,
    message,
  }: {
    eventType:
      | "business.member.role_updated"
      | "business.member.status_updated"
      | "business.member.removed";
    businessId: string;
    memberId: string;
    actorUserId: string;
    targetUserId: string;
    targetEmail: string | null;
    roleId?: string;
    status?: string;
    title: string;
    message: string;
  }) => {
    const metadata = { businessId, memberId, roleId, status };

    await Promise.all([
      auditEventService.recordEventSafely({
        eventType,
        category: "business",
        outcome: "success",
        userId: actorUserId,
        email: null,
        metadata,
      }),
      auditEventService.recordEventSafely({
        eventType,
        category: "business",
        outcome: "success",
        userId: targetUserId,
        email: targetEmail,
        metadata,
        notification: {
          title,
          message,
          severity: status === "removed" ? "warning" : "info",
        },
      }),
    ]);
  };

  const updateBusinessMemberRole = async ({
    businessId,
    memberId,
    roleId,
    actorUserId,
  }: {
    businessId: string;
    memberId: string;
    roleId: string;
    actorUserId: string;
  }) => {
    const { actorPermissions, targetMember, targetUserId } =
      await authorizeMemberMutation({
        businessId,
        memberId,
        actorUserId,
        requiredPermissions: ["members:update_role", "roles:assign"],
      });
    const role = await roleRepository.findAssignableRoleById(roleId, businessId);

    if (!role) {
      throw createHttpError("Role is not assignable to this business", 400);
    }

    if (role.type === "system" && role.key === "owner") {
      throw createHttpError("The Owner role cannot be assigned", 403);
    }

    const requestedPermissions = getEffectivePermissions(role);

    if (
      requestedPermissions.some(
        (permission) => !actorPermissions.has(permission),
      )
    ) {
      throw createHttpError(
        "You cannot assign a role containing permissions you do not have",
        403,
      );
    }

    if (getDocumentId(targetMember.roleId) === roleId) {
      return { businessMember: targetMember };
    }

    const businessMember =
      await businessMemberRepository.updateBusinessMemberRole(
        businessId,
        memberId,
        roleId,
        actorUserId,
      );

    if (!businessMember) {
      throw createHttpError("Business member not found", 404);
    }

    await recordMemberEvent({
      eventType: "business.member.role_updated",
      businessId,
      memberId,
      actorUserId,
      targetUserId,
      targetEmail: getUserEmail(businessMember.userId),
      roleId,
      title: "Business role updated",
      message: `Your business role was changed to ${role.name}.`,
    });

    return { businessMember };
  };

  const updateBusinessMemberStatus = async ({
    businessId,
    memberId,
    status,
    actorUserId,
  }: {
    businessId: string;
    memberId: string;
    status: "active" | "suspended";
    actorUserId: string;
  }) => {
    const { targetMember, targetUserId } = await authorizeMemberMutation({
      businessId,
      memberId,
      actorUserId,
      requiredPermissions: ["members:update_status"],
    });

    if (targetMember.status === status) {
      return { businessMember: targetMember };
    }

    const businessMember =
      await businessMemberRepository.updateBusinessMemberStatus(
        businessId,
        memberId,
        status,
        actorUserId,
      );

    if (!businessMember) {
      throw createHttpError("Business member not found", 404);
    }

    await recordMemberEvent({
      eventType: "business.member.status_updated",
      businessId,
      memberId,
      actorUserId,
      targetUserId,
      targetEmail: getUserEmail(businessMember.userId),
      status,
      title: "Business membership status updated",
      message: `Your business membership is now ${status}.`,
    });

    return { businessMember };
  };

  const removeBusinessMember = async ({
    businessId,
    memberId,
    actorUserId,
  }: {
    businessId: string;
    memberId: string;
    actorUserId: string;
  }) => {
    const { targetMember, targetUserId } = await authorizeMemberMutation({
      businessId,
      memberId,
      actorUserId,
      requiredPermissions: ["members:remove"],
    });
    const businessMember = await businessMemberRepository.removeBusinessMember(
      businessId,
      memberId,
      actorUserId,
    );

    if (!businessMember) {
      throw createHttpError("Business member not found", 404);
    }

    await recordMemberEvent({
      eventType: "business.member.removed",
      businessId,
      memberId,
      actorUserId,
      targetUserId,
      targetEmail: getUserEmail(targetMember.userId),
      status: "removed",
      title: "Removed from business",
      message: "Your business membership was removed.",
    });

    return { businessMember };
  };

  return {
    getBusinessMember,
    listBusinessMembers,
    removeBusinessMember,
    updateBusinessMemberRole,
    updateBusinessMemberStatus,
  };
};

export type BusinessMemberService = ReturnType<
  typeof createBusinessMemberService
>;
