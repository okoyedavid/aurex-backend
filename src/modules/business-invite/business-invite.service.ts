import crypto from "node:crypto";
import type { ClientSession } from "mongoose";
import { HttpError } from "../../utils/api-error.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { RoleRepository } from "../role/role.repository.js";
import type { UserRepository } from "../users/user.repository.js";
import type { BusinessInviteRepository } from "./business-invite.repository.js";
import {
  CreateBusinessInvitePayload,
  InviteMembershipContext,
  InviteMembershipRole,
  InvitePaginationInput,
} from "./business-invite.types.js";
import { EmployeeRepository } from "../employee/employee.repository.js";
import type { EmployeeService } from "../employee/employee.service.js";
import type { ApproveInviteEmployeeInput } from "./business-invite.types.js";

type CreateBusinessInviteServiceDependencies = {
  businessInviteRepository: BusinessInviteRepository;
  businessMemberRepository: BusinessMemberRepository;
  employeeRepository: EmployeeRepository;
  employeeService: EmployeeService;
  roleRepository: RoleRepository;
  userRepository: UserRepository;
  withTransaction: WithTransaction;
  auditEventService: AuditEventService;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

type PopulatedRole = {
  _id?: unknown;
  name?: string;
  key?: string;
  type?: string;
  permissions?: string[];
  deniedPermissions?: string[];
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const createPlaceholderTokenHash = () =>
  crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const getDocumentId = (value: unknown) => {
  if (value && typeof value === "object" && "_id" in value) {
    return String(value._id);
  }

  return String(value);
};

const getDocumentName = (value: unknown, fallback: string) => {
  if (
    value &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string"
  ) {
    return value.name;
  }

  return fallback;
};

const serializeMembershipRole = (
  value: unknown,
): InviteMembershipRole | null => {
  if (!value || typeof value !== "object" || !("_id" in value)) {
    return null;
  }

  const role = value as PopulatedRole;
  if (
    typeof role.name !== "string" ||
    typeof role.key !== "string" ||
    typeof role.type !== "string"
  ) {
    return null;
  }

  return {
    id: String(role._id),
    name: role.name,
    key: role.key,
    type: role.type,
    permissions: role.permissions ?? [],
    deniedPermissions: role.deniedPermissions ?? [],
  };
};

const createMembershipContext = (
  membership: {
    _id: unknown;
    status: "active" | "suspended" | "removed";
    roleId: unknown;
  } | null,
  inviteType: "MEMBER" | "EMPLOYEE",
): InviteMembershipContext => {
  if (!membership || membership.status === "removed") {
    return {
      membershipId: membership ? String(membership._id) : null,
      status: membership?.status ?? "none",
      currentRole: serializeMembershipRole(membership?.roleId),
      roleOutcome: "apply_requested",
    };
  }

  if (membership.status === "suspended") {
    return {
      membershipId: String(membership._id),
      status: membership.status,
      currentRole: serializeMembershipRole(membership.roleId),
      roleOutcome: "blocked_suspended",
    };
  }

  return {
    membershipId: String(membership._id),
    status: membership.status,
    currentRole: serializeMembershipRole(membership.roleId),
    roleOutcome:
      inviteType === "EMPLOYEE"
        ? "preserve_current"
        : "blocked_existing_member",
  };
};

export const createBusinessInviteService = ({
  businessInviteRepository,
  businessMemberRepository,
  roleRepository,
  userRepository,
  withTransaction,
  auditEventService,
  createHttpError,
  employeeRepository,
  employeeService,
}: CreateBusinessInviteServiceDependencies) => {
  const activeMemberId = async (businessId: string, userId: string) => {
    const member = await businessMemberRepository.findActiveMembershipByBusinessAndUser(
      businessId,
      userId,
    ).catch(() => null);
    return member ? getDocumentId(member) : null;
  };
  const getRoleAssignmentDecision = async ({
    businessId,
    invitedByUserId,
    roleId,
    session,
  }: {
    businessId: string;
    invitedByUserId: string;
    roleId: string;
    session?: ClientSession;
  }) => {
    const [role, inviterMembership] = await Promise.all([
      roleRepository.findAssignableRoleById(roleId, businessId, { session }),
      businessMemberRepository.findActiveMembershipByBusinessAndUser(
        businessId,
        invitedByUserId,
        { session },
      ),
    ]);

    if (!role) {
      throw createHttpError("Role is not assignable to this business", 400);
    }

    if (role.type === "system" && role.key === "owner") {
      throw createHttpError(
        "The Owner role cannot be assigned by invitation",
        403,
      );
    }

    const inviterRole = inviterMembership?.roleId as unknown as
      | PopulatedRole
      | undefined;
    const inviterDenials = new Set(inviterRole?.deniedPermissions ?? []);
    const inviterPermissions = new Set(
      (inviterRole?.permissions ?? []).filter(
        (permission) => !inviterDenials.has(permission),
      ),
    );
    const targetDenials = new Set(role.deniedPermissions ?? []);
    const targetPermissions = (role.permissions ?? []).filter(
      (permission) => !targetDenials.has(permission),
    );
    const exceedsInviter = targetPermissions.some(
      (permission) => !inviterPermissions.has(permission),
    );

    const canAssignRole =
      inviterMembership !== null &&
      inviterPermissions.has("roles:assign") &&
      !exceedsInviter;

    return { role, canAssignRole, actorPermissions: inviterPermissions };
  };

  const activateMembershipForInvite = async ({
    businessId,
    userId,
    roleId,
    invitedByUserId,
    inviteType,
    session,
  }: {
    businessId: string;
    userId: string;
    roleId: string;
    invitedByUserId: string;
    inviteType: "MEMBER" | "EMPLOYEE";
    session: ClientSession;
  }) => {
    const existingMembership =
      await businessMemberRepository.findMembershipByBusinessAndUser(
        businessId,
        userId,
        { session },
      );

    if (existingMembership?.status === "active") {
      if (inviteType === "MEMBER") {
        throw createHttpError("You are already a member of this business", 409);
      }

      // Employee linking must not silently replace an existing member's role.
      return existingMembership;
    }

    if (existingMembership?.status === "suspended") {
      throw createHttpError(
        "A suspended membership must be restored by a business administrator",
        409,
      );
    }

    if (existingMembership) {
      const reactivatedMembership =
        await businessMemberRepository.reactivateBusinessMember(
          existingMembership._id.toString(),
          { roleId, invitedByUserId },
          { session },
        );

      if (!reactivatedMembership) {
        throw createHttpError(
          "Business membership could not be reactivated",
          409,
        );
      }

      return reactivatedMembership;
    }

    return businessMemberRepository.createBusinessMember(
      { businessId, userId, roleId, invitedByUserId },
      { session },
    );
  };

  const linkEmployeeToMembership = async ({
    employeeId,
    businessId,
    businessMemberId,
    session,
  }: {
    employeeId: string;
    businessId: string;
    businessMemberId: string;
    session: ClientSession;
  }) => {
    const memberEmployee = await employeeRepository.findByBusinessMember(
      businessId,
      businessMemberId,
      { session },
    );

    if (memberEmployee) {
      if (memberEmployee._id.toString() === employeeId) {
        return memberEmployee;
      }

      throw createHttpError(
        "This business member is already linked to another employee",
        409,
      );
    }

    const claimedEmployee = await employeeRepository.claimForBusinessMember(
      employeeId,
      businessId,
      businessMemberId,
      { session },
    );

    if (claimedEmployee) {
      return claimedEmployee;
    }

    const employee = await employeeRepository.findByIdAndBusiness(
      employeeId,
      businessId,
      { session },
    );

    if (!employee) {
      throw createHttpError("Employee not found in this business", 404);
    }

    throw createHttpError(
      "This employee is already linked to a business member",
      409,
    );
  };

  const createBusinessInvite = async ({
    businessId,
    invitedByUserId,
    roleId,
    email,
    type,
    employeeId,
  }: CreateBusinessInvitePayload) => {
    const normalizedEmail = normalizeEmail(email);
    const inviteType = type ?? "MEMBER";

    if (inviteType === "MEMBER" && employeeId) {
      throw createHttpError(
        "A member invitation cannot reference an employee",
        400,
      );
    }

    let employee = null;

    if (inviteType === "EMPLOYEE" && employeeId) {
      employee = await employeeRepository.findByIdAndBusiness(
        employeeId,
        businessId,
      );

      if (!employee) {
        throw createHttpError("Employee not found", 404);
      }

      if (employee.businessMemberId) {
        throw createHttpError(
          "This employee is already linked to a business member",
          409,
        );
      }

      const existingEmployeeInvite =
        await businessInviteRepository.findOpenInviteByBusinessAndEmployee(
          businessId,
          employeeId,
        );

      if (existingEmployeeInvite) {
        throw createHttpError(
          "An open invitation already exists for this employee",
          409,
        );
      }
    }

    await getRoleAssignmentDecision({ businessId, invitedByUserId, roleId });
    await businessInviteRepository.expirePendingInvites({
      businessId,
      email: normalizedEmail,
    });

    const [existingUser, existingOpenInvite] = await Promise.all([
      userRepository.findUserByEmail(normalizedEmail),
      businessInviteRepository.findOpenInviteByBusinessAndEmail(
        businessId,
        normalizedEmail,
      ),
    ]);

    if (existingOpenInvite) {
      throw createHttpError(
        "An open invitation already exists for this email",
        409,
      );
    }

    if (existingUser) {
      const existingMembership =
        await businessMemberRepository.findMembershipByBusinessAndUser(
          businessId,
          existingUser._id.toString(),
        );

      if (existingMembership?.status === "active" && inviteType === "MEMBER") {
        throw createHttpError("This user is already a business member", 409);
      }
    }

    try {
      const businessInvite =
        await businessInviteRepository.createBusinessInvite({
          businessId,
          email: normalizedEmail,
          roleId,
          invitedByUserId,
          // The email worker replaces this unique placeholder with the hash of
          // the raw token it generates immediately before delivery.
          type: inviteType,
          employeeId: employeeId ?? null,
          tokenHash: createPlaceholderTokenHash(),
        });

      const populatedInvite =
        await businessInviteRepository.findBusinessInviteById(
          businessInvite._id.toString(),
        );

      const returnedInvite = populatedInvite ?? businessInvite;
      const inviteId = businessInvite._id.toString();
      const businessName = getDocumentName(
        returnedInvite.businessId,
        "the business",
      );
      const eventMetadata = {
        businessId,
        inviteId,
        roleId,
        inviteType,
        employeeId: employeeId ?? null,
      };
      const inviterMemberId = await activeMemberId(businessId, invitedByUserId);

      const eventWrites = [
        auditEventService.recordEventSafely({
          eventType: "business.invite.created",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: inviterMemberId,
          employeeId: employeeId ?? null,
          subjectType: "invitation",
          subjectId: inviteId,
          userId: invitedByUserId,
          email: null,
          metadata: eventMetadata,
        }),
      ];

      if (existingUser) {
        eventWrites.push(
          auditEventService.recordEventSafely({
            eventType: "business.invite.created",
            category: "business",
            outcome: "success",
            userId: existingUser._id.toString(),
            email: existingUser.email,
            metadata: eventMetadata,
            notification: {
              title: "Business invitation received",
              message: `You were invited to join ${businessName}.`,
              severity: "info",
            },
          }),
        );
      }

      await Promise.all(eventWrites);

      return { businessInvite: returnedInvite };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError(
          "An open invitation already exists for this email",
          409,
        );
      }

      throw error;
    }
  };

  const listSentBusinessInvites = async ({
    businessId,
    page,
    limit,
    status,
  }: InvitePaginationInput & { businessId: string }) => {
    await businessInviteRepository.expirePendingInvites({ businessId });
    const { items, total } =
      await businessInviteRepository.paginateBusinessInvitesByBusinessId({
        businessId,
        page,
        limit,
        status,
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

  const viewBusinessInvites = async ({
    email,
    page,
    limit,
    status,
  }: InvitePaginationInput & { email: string }) => {
    const normalizedEmail = normalizeEmail(email);
    await businessInviteRepository.expirePendingInvites({
      email: normalizedEmail,
    });
    const { items, total } =
      await businessInviteRepository.paginateBusinessInvitesByEmail({
        email: normalizedEmail,
        page,
        limit,
        status,
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

  const getRecipientInvite = async ({
    inviteId,
    email,
    session,
  }: {
    inviteId: string;
    email: string;
    session?: ClientSession;
  }) => {
    const invite = await businessInviteRepository.findInviteByIdForRecipient(
      inviteId,
      normalizeEmail(email),
      { session },
    );

    if (!invite) {
      throw createHttpError("Business invitation not found", 404);
    }

    if (invite.status !== "pending") {
      throw createHttpError(`Business invitation is ${invite.status}`, 409);
    }

    if (invite.expiresAt <= new Date()) {
      await businessInviteRepository.markInviteExpired(inviteId);
      throw createHttpError("Business invitation has expired", 410);
    }

    return invite;
  };

  const acceptBusinessInvite = async ({
    inviteId,
    userId,
    email,
  }: {
    inviteId: string;
    userId: string;
    email: string;
  }) => {
    await getRecipientInvite({ inviteId, email });

    const { membershipActivated, membershipCreated } = await withTransaction(
      async (session) => {
        const invite = await getRecipientInvite({ inviteId, email, session });
        const businessId = invite.businessId.toString();
        const employeeId = invite.employeeId?.toString() ?? null;
        const roleId = invite.roleId.toString();
        const inviteType = invite.type;
        const existingMembership =
          await businessMemberRepository.findMembershipByBusinessAndUser(
            businessId,
            userId,
            { session },
          );

        if (
          existingMembership?.status === "active" &&
          inviteType === "MEMBER"
        ) {
          throw createHttpError(
            "You are already a member of this business",
            409,
          );
        }

        if (existingMembership?.status === "suspended") {
          throw createHttpError(
            "A suspended membership must be restored by a business administrator",
            409,
          );
        }

        const { canAssignRole, actorPermissions } =
          await getRoleAssignmentDecision({
            businessId,
            invitedByUserId: invite.invitedByUserId.toString(),
            roleId,
            session,
          });

        if (employeeId) {
          const employee = await employeeRepository.findByIdAndBusiness(
            employeeId,
            businessId,
            { session },
          );

          if (!employee) {
            throw createHttpError("Employee not found in this business", 404);
          }
        }

        const activeEmployeeMembership =
          inviteType === "EMPLOYEE" && existingMembership?.status === "active";
        const roleCanBeApplied = activeEmployeeMembership || canAssignRole;
        const employeeCanBeHandled =
          inviteType === "MEMBER" ||
          (employeeId !== null && actorPermissions.has("employees:update"));
        const canCompleteInvite = roleCanBeApplied && employeeCanBeHandled;

        if (canCompleteInvite) {
          const membership = await activateMembershipForInvite({
            businessId,
            userId,
            roleId,
            invitedByUserId: invite.invitedByUserId.toString(),
            inviteType,
            session,
          });

          if (inviteType === "EMPLOYEE" && employeeId) {
            await linkEmployeeToMembership({
              employeeId,
              businessId,
              businessMemberId: membership._id.toString(),
              session,
            });
          }
        }

        const acceptedInvite =
          await businessInviteRepository.acceptPendingInvite(
            inviteId,
            userId,
            canCompleteInvite ? "not_required" : "pending",
            { session },
          );

        if (!acceptedInvite) {
          throw createHttpError(
            "Business invitation is no longer available",
            409,
          );
        }

        return {
          membershipActivated: canCompleteInvite,
          membershipCreated: canCompleteInvite && existingMembership === null,
        };
      },
    );

    const businessInvite =
      await businessInviteRepository.findBusinessInviteById(inviteId);

    if (businessInvite) {
      const businessId = getDocumentId(businessInvite.businessId);
      const inviterUserId = getDocumentId(businessInvite.invitedByUserId);
      const roleId = getDocumentId(businessInvite.roleId);
      const linkedEmployeeId = businessInvite.employeeId
        ? getDocumentId(businessInvite.employeeId)
        : null;
      const businessName = getDocumentName(
        businessInvite.businessId,
        "the business",
      );
      const [inviterMemberId, acceptingMemberId] = await Promise.all([
        activeMemberId(businessId, inviterUserId),
        activeMemberId(businessId, userId),
      ]);

      const events = [
        auditEventService.recordEventSafely({
          eventType: "business.invite.accepted",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: acceptingMemberId,
          subjectType: "invitation",
          subjectId: inviteId,
          userId: inviterUserId,
          email: null,
          metadata: { businessId, inviteId, roleId },
          notification: {
            title: "Business invitation accepted",
            message: `${email} accepted the invitation to join ${businessName}.`,
            severity: "info",
          },
        }),
      ];

      events.push(
        auditEventService.recordEventSafely({
          eventType: membershipActivated
            ? "business.membership.activated"
            : "business.invite.approval_requested",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: acceptingMemberId,
          subjectBusinessMemberId: membershipActivated ? acceptingMemberId : null,
          subjectType: membershipActivated ? "member" : "invitation",
          subjectId: membershipActivated && acceptingMemberId ? acceptingMemberId : inviteId,
          userId,
          email,
          metadata: { businessId, inviteId, roleId },
          notification: membershipActivated
            ? {
                title: "Business membership activated",
                message: `You are now a member of ${businessName}.`,
                severity: "info",
              }
            : {
                title: "Invitation awaiting approval",
                message: `Your request to join ${businessName} is awaiting role approval.`,
                severity: "info",
              },
        }),
      );

      if (membershipActivated && linkedEmployeeId && acceptingMemberId) {
        events.push(
          auditEventService.recordEventSafely({
            eventType: "business.employee.updated",
            category: "business",
            outcome: "success",
            businessId,
            actorBusinessMemberId: acceptingMemberId,
            subjectBusinessMemberId: acceptingMemberId,
            employeeId: linkedEmployeeId,
            subjectType: "employee",
            subjectId: linkedEmployeeId,
            userId,
            email,
            changes: {
              fields: ["businessMemberId"],
              before: { businessMemberId: null },
              after: { businessMemberId: acceptingMemberId },
            },
          }),
        );
      }

      await Promise.all(events);
    }

    return { businessInvite, membershipActivated, membershipCreated };
  };

  const rejectBusinessInvite = async ({
    inviteId,
    userId,
    email,
  }: {
    inviteId: string;
    userId: string;
    email: string;
  }) => {
    await getRecipientInvite({ inviteId, email });

    const rejectedInvite = await businessInviteRepository.rejectPendingInvite(
      inviteId,
      userId,
    );

    if (!rejectedInvite) {
      throw createHttpError("Business invitation is no longer available", 409);
    }

    const businessInvite =
      await businessInviteRepository.findBusinessInviteById(inviteId);

    if (businessInvite) {
      const businessId = getDocumentId(businessInvite.businessId);
      const inviterUserId = getDocumentId(businessInvite.invitedByUserId);
      const roleId = getDocumentId(businessInvite.roleId);
      const businessName = getDocumentName(
        businessInvite.businessId,
        "the business",
      );

      const decliningMemberId = await activeMemberId(businessId, userId);

      await auditEventService.recordEventSafely({
        eventType: "business.invite.declined",
        category: "business",
        outcome: "success",
        businessId,
        actorBusinessMemberId: decliningMemberId,
        subjectType: "invitation",
        subjectId: inviteId,
        userId: inviterUserId,
        email: null,
        metadata: { businessId, inviteId, roleId },
        notification: {
          title: "Business invitation declined",
          message: `${email} declined the invitation to join ${businessName}.`,
          severity: "info",
        },
      });
    }

    return { businessInvite };
  };

  const listPendingInviteApprovals = async ({
    businessId,
    page,
    limit,
  }: {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } =
      await businessInviteRepository.paginatePendingApprovalInvites({
        businessId,
        page,
        limit,
      });

    const acceptedUserIds = items
      .map((invite) => invite.acceptedByUserId)
      .filter((userId): userId is NonNullable<typeof userId> => Boolean(userId))
      .map(getDocumentId);
    const memberships = acceptedUserIds.length
      ? await businessMemberRepository.findMembershipsByBusinessAndUsers(
          businessId,
          acceptedUserIds,
        )
      : [];
    const membershipByUserId = new Map(
      memberships.map((membership) => [
        getDocumentId(membership.userId),
        membership,
      ]),
    );

    return {
      items: items.map((invite) => {
        const acceptedUserId = invite.acceptedByUserId
          ? getDocumentId(invite.acceptedByUserId)
          : null;
        const membership = acceptedUserId
          ? (membershipByUserId.get(acceptedUserId) ?? null)
          : null;

        return {
          ...invite.toJSON(),
          membershipContext: createMembershipContext(membership, invite.type),
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const approveBusinessInvite = async ({
    businessId,
    inviteId,
    approvedByUserId,
    employee,
  }: {
    businessId: string;
    inviteId: string;
    approvedByUserId: string;
    employee?: ApproveInviteEmployeeInput;
  }) => {
    await withTransaction(async (session) => {
      const invite = await businessInviteRepository.findPendingApprovalInvite(
        businessId,
        inviteId,
        { session },
      );

      if (!invite) {
        throw createHttpError("Pending invite approval not found", 404);
      }

      if (!invite.acceptedByUserId) {
        throw createHttpError(
          "The recipient has not accepted this invite",
          409,
        );
      }

      const roleId = invite.roleId.toString();
      const inviteType = invite.type;
      const existingEmployeeId = invite.employeeId?.toString() ?? null;
      const { canAssignRole, actorPermissions } =
        await getRoleAssignmentDecision({
          businessId,
          invitedByUserId: approvedByUserId,
          roleId,
          session,
        });

      if (!canAssignRole) {
        throw createHttpError(
          "You cannot approve a role containing permissions you do not have",
          403,
        );
      }

      const userId = invite.acceptedByUserId.toString();
      if (inviteType === "MEMBER" && employee) {
        throw createHttpError(
          "Employee details are not valid for a member invitation",
          400,
        );
      }

      if (inviteType === "EMPLOYEE" && existingEmployeeId && employee) {
        throw createHttpError(
          "This invitation already references an employee",
          400,
        );
      }

      if (inviteType === "EMPLOYEE" && !existingEmployeeId && !employee) {
        throw createHttpError(
          "Employee details are required to approve this invitation",
          400,
        );
      }

      if (
        inviteType === "EMPLOYEE" &&
        existingEmployeeId &&
        !actorPermissions.has("employees:update")
      ) {
        throw createHttpError(
          "You need employees:update to link an existing employee",
          403,
        );
      }

      if (
        inviteType === "EMPLOYEE" &&
        !existingEmployeeId &&
        !actorPermissions.has("employees:create")
      ) {
        throw createHttpError(
          "You need employees:create to create the employee record",
          403,
        );
      }

      if (
        inviteType === "EMPLOYEE" &&
        !existingEmployeeId &&
        !actorPermissions.has("employee_lists:view")
      ) {
        throw createHttpError(
          "You need employee_lists:view to select the employee list",
          403,
        );
      }

      const membership = await activateMembershipForInvite({
        businessId,
        userId,
        roleId,
        invitedByUserId: invite.invitedByUserId.toString(),
        inviteType,
        session,
      });

      let resolvedEmployeeId = existingEmployeeId;

      if (inviteType === "EMPLOYEE" && existingEmployeeId) {
        await linkEmployeeToMembership({
          employeeId: existingEmployeeId,
          businessId,
          businessMemberId: membership._id.toString(),
          session,
        });
      } else if (inviteType === "EMPLOYEE" && employee) {
        const memberEmployee = await employeeRepository.findByBusinessMember(
          businessId,
          membership._id.toString(),
          { session },
        );

        if (memberEmployee) {
          throw createHttpError(
            "This business member is already linked to an employee",
            409,
          );
        }

        const { employee: createdEmployee } =
          await employeeService.createEmployeeForListInSession(
            {
              ...employee,
              businessId,
              businessMemberId: membership._id.toString(),
            },
            session,
          );
        resolvedEmployeeId = createdEmployee._id.toString();
      }

      const approvedInvite = await businessInviteRepository.approveInvite(
        businessId,
        inviteId,
        approvedByUserId,
        resolvedEmployeeId,
        { session },
      );

      if (!approvedInvite) {
        throw createHttpError("Invite approval is no longer pending", 409);
      }
    });

    const businessInvite =
      await businessInviteRepository.findBusinessInviteById(inviteId);

    if (businessInvite?.acceptedByUserId) {
      const userId = getDocumentId(businessInvite.acceptedByUserId);
      const roleId = getDocumentId(businessInvite.roleId);
      const linkedEmployeeId = businessInvite.employeeId
        ? getDocumentId(businessInvite.employeeId)
        : null;
      const businessName = getDocumentName(
        businessInvite.businessId,
        "the business",
      );
      const [approverMemberId, acceptedMemberId] = await Promise.all([
        activeMemberId(businessId, approvedByUserId),
        activeMemberId(businessId, userId),
      ]);

      await Promise.all([
        auditEventService.recordEventSafely({
          eventType: "business.invite.approved",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: approverMemberId,
          subjectBusinessMemberId: acceptedMemberId,
          subjectType: "invitation",
          subjectId: inviteId,
          userId: approvedByUserId,
          email: null,
          metadata: { businessId, inviteId, roleId },
        }),
        auditEventService.recordEventSafely({
          eventType: "business.membership.activated",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: approverMemberId,
          subjectBusinessMemberId: acceptedMemberId,
          subjectType: "member",
          subjectId: acceptedMemberId,
          userId,
          email: businessInvite.email,
          metadata: { businessId, inviteId, roleId },
          notification: {
            title: "Business membership approved",
            message: `Your membership in ${businessName} has been approved.`,
            severity: "info",
          },
        }),
        ...(linkedEmployeeId && acceptedMemberId
          ? [auditEventService.recordEventSafely({
              eventType: employee
                ? "business.employee.created"
                : "business.employee.updated",
              category: "business",
              outcome: "success",
              businessId,
              actorBusinessMemberId: approverMemberId,
              subjectBusinessMemberId: acceptedMemberId,
              employeeId: linkedEmployeeId,
              subjectType: "employee",
              subjectId: linkedEmployeeId,
              userId,
              email: businessInvite.email,
              changes: employee
                ? undefined
                : {
                    fields: ["businessMemberId"],
                    before: { businessMemberId: null },
                    after: { businessMemberId: acceptedMemberId },
                  },
            })]
          : []),
      ]);
    }

    return { businessInvite };
  };

  const rejectBusinessInviteApproval = async ({
    businessId,
    inviteId,
    rejectedByUserId,
  }: {
    businessId: string;
    inviteId: string;
    rejectedByUserId: string;
  }) => {
    const rejectedInvite = await businessInviteRepository.rejectInviteApproval(
      businessId,
      inviteId,
      rejectedByUserId,
    );

    if (!rejectedInvite) {
      throw createHttpError("Pending invite approval not found", 404);
    }

    const businessInvite =
      await businessInviteRepository.findBusinessInviteById(inviteId);

    if (businessInvite?.acceptedByUserId) {
      const roleId = getDocumentId(businessInvite.roleId);
      const recipientUserId = getDocumentId(businessInvite.acceptedByUserId);
      const businessName = getDocumentName(
        businessInvite.businessId,
        "the business",
      );
      const rejectingMemberId = await activeMemberId(businessId, rejectedByUserId);

      await auditEventService.recordEventSafely({
          eventType: "business.invite.approval_rejected",
          category: "business",
          outcome: "success",
          businessId,
          actorBusinessMemberId: rejectingMemberId,
          subjectType: "invitation",
          subjectId: inviteId,
          userId: recipientUserId,
          email: businessInvite.email,
          metadata: { businessId, inviteId, roleId },
          notification: {
            title: "Business membership request rejected",
            message: `Your request to join ${businessName} was not approved.`,
            severity: "warning",
          },
        });
    }

    return { businessInvite };
  };

  return {
    acceptBusinessInvite,
    approveBusinessInvite,
    createBusinessInvite,
    listPendingInviteApprovals,
    listSentBusinessInvites,
    rejectBusinessInvite,
    rejectBusinessInviteApproval,
    viewBusinessInvites,
  };
};

export type BusinessInviteService = ReturnType<
  typeof createBusinessInviteService
>;
