import { RepositoryOptions } from "../../types/repository-types.js";
import { BusinessInvite } from "./business-invite.model.js";
import {
  InvitePaginationInput,
  PersistBusinessInvitePayload,
} from "./business-invite.types.js";

const invitePopulations = [
  {
    path: "businessId",
    select: "name industry profile_img",
  },
  {
    path: "roleId",
    select: "name key type permissions deniedPermissions",
  },
  {
    path: "acceptedByUserId",
    select: "name email avatar",
  },
  {
    path: "invitedByUserId",
    select: "name email avatar",
  },
  {
    path: "rejectedByUserId",
    select: "name email avatar",
  },
  {
    path: "approvedByUserId",
    select: "name email avatar",
  },
  {
    path: "approvalRejectedByUserId",
    select: "name email avatar",
  },
];

const createBusinessInvite = (
  payload: PersistBusinessInvitePayload,
  options: RepositoryOptions = {},
) =>
  BusinessInvite.create([payload], options).then(([invite]) => {
    if (!invite) {
      throw new Error("Failed to create business invite");
    }

    return invite;
  });

const findOpenInviteByBusinessAndEmail = (
  businessId: string,
  email: string,
) =>
  BusinessInvite.findOne({
    businessId,
    email,
    $or: [
      { status: "pending" },
      { status: "accepted", approvalStatus: "pending" },
    ],
  });

const expirePendingInvites = (filter: { businessId?: string; email?: string }) =>
  BusinessInvite.updateMany(
    {
      ...filter,
      status: "pending",
      expiresAt: { $lte: new Date() },
    },
    { status: "expired" },
  );

const paginateBusinessInvitesByBusinessId = async ({
  businessId,
  page,
  limit,
  status,
}: InvitePaginationInput & { businessId: string }) => {
  const filter: Record<string, unknown> = { businessId };

  if (status) {
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    BusinessInvite.find(filter)
      .select("+emailFailureReason")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(invitePopulations),
    BusinessInvite.countDocuments(filter),
  ]);

  return { items, total };
};

const paginateBusinessInvitesByEmail = async ({
  email,
  page,
  limit,
  status,
}: InvitePaginationInput & { email: string }) => {
  const filter: Record<string, unknown> = { email };

  if (status) {
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    BusinessInvite.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(invitePopulations),
    BusinessInvite.countDocuments(filter),
  ]);

  return { items, total };
};

const findInviteByIdForRecipient = (
  inviteId: string,
  email: string,
  options: RepositoryOptions = {},
) =>
  BusinessInvite.findOne({ _id: inviteId, email }).session(
    options.session ?? null,
  );

const findBusinessInviteById = (inviteId: string) =>
  BusinessInvite.findById(inviteId).populate(invitePopulations);

const acceptPendingInvite = (
  inviteId: string,
  acceptedByUserId: string,
  approvalStatus: "not_required" | "pending",
  options: RepositoryOptions = {},
) =>
  BusinessInvite.findOneAndUpdate(
    { _id: inviteId, status: "pending", expiresAt: { $gt: new Date() } },
    {
      status: "accepted",
      acceptedByUserId,
      acceptedAt: new Date(),
      approvalStatus,
    },
    { returnDocument: "after", session: options.session },
  );

const paginatePendingApprovalInvites = async ({
  businessId,
  page,
  limit,
}: {
  businessId: string;
  page: number;
  limit: number;
}) => {
  const filter = {
    businessId,
    status: "accepted" as const,
    approvalStatus: "pending" as const,
  };
  const [items, total] = await Promise.all([
    BusinessInvite.find(filter)
      .sort({ acceptedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(invitePopulations),
    BusinessInvite.countDocuments(filter),
  ]);

  return { items, total };
};

const findPendingApprovalInvite = (
  businessId: string,
  inviteId: string,
  options: RepositoryOptions = {},
) =>
  BusinessInvite.findOne({
    _id: inviteId,
    businessId,
    status: "accepted",
    approvalStatus: "pending",
  }).session(options.session ?? null);

const approveInvite = (
  businessId: string,
  inviteId: string,
  approvedByUserId: string,
  options: RepositoryOptions = {},
) =>
  BusinessInvite.findOneAndUpdate(
    {
      _id: inviteId,
      businessId,
      status: "accepted",
      approvalStatus: "pending",
    },
    {
      approvalStatus: "approved",
      approvedByUserId,
      approvedAt: new Date(),
    },
    { returnDocument: "after", session: options.session },
  );

const rejectInviteApproval = (
  businessId: string,
  inviteId: string,
  rejectedByUserId: string,
) =>
  BusinessInvite.findOneAndUpdate(
    {
      _id: inviteId,
      businessId,
      status: "accepted",
      approvalStatus: "pending",
    },
    {
      approvalStatus: "rejected",
      approvalRejectedByUserId: rejectedByUserId,
      approvalRejectedAt: new Date(),
    },
    { returnDocument: "after" },
  );

const rejectPendingInvite = (
  inviteId: string,
  rejectedByUserId: string,
  options: RepositoryOptions = {},
) =>
  BusinessInvite.findOneAndUpdate(
    { _id: inviteId, status: "pending", expiresAt: { $gt: new Date() } },
    {
      status: "rejected",
      rejectedByUserId,
      rejectedAt: new Date(),
    },
    { returnDocument: "after", session: options.session },
  );

const markInviteExpired = (inviteId: string) =>
  BusinessInvite.findOneAndUpdate(
    { _id: inviteId, status: "pending" },
    { status: "expired" },
    { returnDocument: "after" },
  );

const countOpenInvitesByRole = (businessId: string, roleId: string) =>
  BusinessInvite.countDocuments({
    businessId,
    roleId,
    $or: [
      { status: "pending" },
      { status: "accepted", approvalStatus: "pending" },
    ],
  });

export const businessInviteRepository = {
  acceptPendingInvite,
  approveInvite,
  createBusinessInvite,
  countOpenInvitesByRole,
  expirePendingInvites,
  findBusinessInviteById,
  findInviteByIdForRecipient,
  findPendingApprovalInvite,
  findOpenInviteByBusinessAndEmail,
  markInviteExpired,
  paginateBusinessInvitesByBusinessId,
  paginateBusinessInvitesByEmail,
  paginatePendingApprovalInvites,
  rejectPendingInvite,
  rejectInviteApproval,
};

export type BusinessInviteRepository = typeof businessInviteRepository;
