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
  InvitePaginationInput,
} from "./business-invite.types.js";

type CreateBusinessInviteServiceDependencies = {
  businessInviteRepository: BusinessInviteRepository;
  businessMemberRepository: BusinessMemberRepository;
  roleRepository: RoleRepository;
  userRepository: UserRepository;
  withTransaction: WithTransaction;
  auditEventService: AuditEventService;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

type PopulatedRole = {
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

export const createBusinessInviteService = ({
  businessInviteRepository,
  businessMemberRepository,
  roleRepository,
  userRepository,
  withTransaction,
  auditEventService,
  createHttpError,
}: CreateBusinessInviteServiceDependencies) => {
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
      throw createHttpError("The Owner role cannot be assigned by invitation", 403);
    }

    const inviterRole = inviterMembership?.roleId as unknown as
      | PopulatedRole
      | undefined;
    const inviterPermissions = new Set(inviterRole?.permissions ?? []);
    const inviterDenials = new Set(inviterRole?.deniedPermissions ?? []);
    const targetDenials = new Set(role.deniedPermissions ?? []);
    const targetPermissions = (role.permissions ?? []).filter(
      (permission) => !targetDenials.has(permission),
    );
    const exceedsInviter = targetPermissions.some(
      (permission) =>
        !inviterPermissions.has(permission) || inviterDenials.has(permission),
    );

    const canAssignRole =
      inviterMembership !== null &&
      inviterPermissions.has("roles:assign") &&
      !inviterDenials.has("roles:assign") &&
      !exceedsInviter;

    return { role, canAssignRole };
  };

  const createBusinessInvite = async ({
    businessId,
    invitedByUserId,
    roleId,
    email,
  }: CreateBusinessInvitePayload) => {
    const normalizedEmail = normalizeEmail(email);

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

      if (existingMembership?.status === "active") {
        throw createHttpError("This user is already a business member", 409);
      }
    }

    try {
      const businessInvite = await businessInviteRepository.createBusinessInvite(
        {
          businessId,
          email: normalizedEmail,
          roleId,
          invitedByUserId,
          // The email worker replaces this unique placeholder with the hash of
          // the raw token it generates immediately before delivery.
          tokenHash: createPlaceholderTokenHash(),
        },
      );

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
      const eventMetadata = { businessId, inviteId, roleId };

      const eventWrites = [
        auditEventService.recordEventSafely({
          eventType: "business.invite.created",
          category: "business",
          outcome: "success",
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

    const { membershipCreated } = await withTransaction(async (session) => {
      const invite = await getRecipientInvite({ inviteId, email, session });
      const businessId = invite.businessId.toString();
      const roleId = invite.roleId.toString();
      const { canAssignRole } = await getRoleAssignmentDecision({
        businessId,
        invitedByUserId: invite.invitedByUserId.toString(),
        roleId,
        session,
      });

      if (canAssignRole) {
        const existingMembership =
          await businessMemberRepository.findMembershipByBusinessAndUser(
            businessId,
            userId,
            { session },
          );

        if (existingMembership?.status === "active") {
          throw createHttpError("You are already a member of this business", 409);
        }

        if (existingMembership) {
          await businessMemberRepository.reactivateBusinessMember(
            existingMembership._id.toString(),
            {
              roleId,
              invitedByUserId: invite.invitedByUserId.toString(),
            },
            { session },
          );
        } else {
          await businessMemberRepository.createBusinessMember(
            {
              businessId,
              userId,
              roleId,
              invitedByUserId: invite.invitedByUserId.toString(),
            },
            { session },
          );
        }
      }

      const acceptedInvite =
        await businessInviteRepository.acceptPendingInvite(
          inviteId,
          userId,
          canAssignRole ? "not_required" : "pending",
          { session },
        );

      if (!acceptedInvite) {
        throw createHttpError("Business invitation is no longer available", 409);
      }

      return { membershipCreated: canAssignRole };
    });

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

      const events = [
        auditEventService.recordEventSafely({
          eventType: "business.invite.accepted",
          category: "business",
          outcome: "success",
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
          eventType: membershipCreated
            ? "business.membership.activated"
            : "business.invite.approval_requested",
          category: "business",
          outcome: "success",
          userId,
          email,
          metadata: { businessId, inviteId, roleId },
          notification: membershipCreated
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

      await Promise.all(events);
    }

    return { businessInvite, membershipCreated };
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

      await auditEventService.recordEventSafely({
        eventType: "business.invite.declined",
        category: "business",
        outcome: "success",
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

  const approveBusinessInvite = async ({
    businessId,
    inviteId,
    approvedByUserId,
  }: {
    businessId: string;
    inviteId: string;
    approvedByUserId: string;
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
        throw createHttpError("The recipient has not accepted this invite", 409);
      }

      const roleId = invite.roleId.toString();
      const { canAssignRole } = await getRoleAssignmentDecision({
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
      const existingMembership =
        await businessMemberRepository.findMembershipByBusinessAndUser(
          businessId,
          userId,
          { session },
        );

      if (existingMembership?.status === "active") {
        throw createHttpError("This user is already a business member", 409);
      }

      if (existingMembership) {
        await businessMemberRepository.reactivateBusinessMember(
          existingMembership._id.toString(),
          {
            roleId,
            invitedByUserId: invite.invitedByUserId.toString(),
          },
          { session },
        );
      } else {
        await businessMemberRepository.createBusinessMember(
          {
            businessId,
            userId,
            roleId,
            invitedByUserId: invite.invitedByUserId.toString(),
          },
          { session },
        );
      }

      const approvedInvite = await businessInviteRepository.approveInvite(
        businessId,
        inviteId,
        approvedByUserId,
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
      const businessName = getDocumentName(
        businessInvite.businessId,
        "the business",
      );

      await Promise.all([
        auditEventService.recordEventSafely({
          eventType: "business.invite.approved",
          category: "business",
          outcome: "success",
          userId: approvedByUserId,
          email: null,
          metadata: { businessId, inviteId, roleId },
        }),
        auditEventService.recordEventSafely({
          eventType: "business.membership.activated",
          category: "business",
          outcome: "success",
          userId,
          email: businessInvite.email,
          metadata: { businessId, inviteId, roleId },
          notification: {
            title: "Business membership approved",
            message: `Your membership in ${businessName} has been approved.`,
            severity: "info",
          },
        }),
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
    const rejectedInvite =
      await businessInviteRepository.rejectInviteApproval(
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

      await Promise.all([
        auditEventService.recordEventSafely({
          eventType: "business.invite.approval_rejected",
          category: "business",
          outcome: "success",
          userId: rejectedByUserId,
          email: null,
          metadata: { businessId, inviteId, roleId },
        }),
        auditEventService.recordEventSafely({
          eventType: "business.invite.approval_rejected",
          category: "business",
          outcome: "success",
          userId: recipientUserId,
          email: businessInvite.email,
          metadata: { businessId, inviteId, roleId },
          notification: {
            title: "Business membership request rejected",
            message: `Your request to join ${businessName} was not approved.`,
            severity: "warning",
          },
        }),
      ]);
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
