import { RepositoryOptions } from "../../types/repository-types.js";
import { BusinessMember } from "./business-member.model.js";

type CreateBusinessMemberPayload = {
  businessId: string;
  userId: string;
  roleId: string;
  invitedByUserId?: string | null;
};

const createBusinessMember = (
  payload: CreateBusinessMemberPayload,
  options: RepositoryOptions = {},
) =>
  BusinessMember.create([payload], options).then(([member]) => {
    if (!member) {
      throw new Error("Failed to create business member");
    }

    return member;
  });

const findActiveMembershipsByUserId = (userId: string) =>
  BusinessMember.find({ userId, status: "active" })
    .populate("businessId")
    .populate("roleId")
    .sort({ createdAt: -1 });

const findActiveMembershipByBusinessAndUser = (
  businessId: string,
  userId: string,
  options: RepositoryOptions = {},
) =>
  BusinessMember.findOne({ businessId, userId, status: "active" })
    .session(options.session ?? null)
    .populate("businessId")
    .populate("roleId");

const findMembershipByBusinessAndUser = (
  businessId: string,
  userId: string,
  options: RepositoryOptions = {},
) =>
  BusinessMember.findOne({ businessId, userId }).session(
    options.session ?? null,
  );

const reactivateBusinessMember = (
  memberId: string,
  payload: { roleId: string; invitedByUserId: string },
  options: RepositoryOptions = {},
) =>
  BusinessMember.findByIdAndUpdate(
    memberId,
    {
      $set: {
        ...payload,
        status: "active",
        roleUpdatedByUserId: payload.invitedByUserId,
        roleUpdatedAt: new Date(),
        statusUpdatedByUserId: payload.invitedByUserId,
        statusUpdatedAt: new Date(),
      },
      $unset: {
        removedByUserId: 1,
        removedAt: 1,
      },
    },
    { returnDocument: "after", session: options.session },
  );

const countAssignedMembersByRole = (businessId: string, roleId: string) =>
  BusinessMember.countDocuments({
    businessId,
    roleId,
    status: { $in: ["active", "suspended"] },
  });

const memberPopulations = [
  {
    path: "businessId",
    select: "name industry profile_img",
  },
  {
    path: "roleId",
    select: "name key type permissions deniedPermissions",
  },
  {
    path: "userId",
    select: "name email avatar",
  },
  {
    path: "invitedByUserId",
    select: "name email avatar",
  },
  {
    path: "roleUpdatedByUserId",
    select: "name email avatar",
  },
  {
    path: "statusUpdatedByUserId",
    select: "name email avatar",
  },
  {
    path: "removedByUserId",
    select: "name email avatar",
  },
];

const paginateBusinessMembersByBusinessId = async ({
  businessId,
  page,
  limit,
}: {
  businessId: string;
  page: number;
  limit: number;
}) => {
  const [items, total] = await Promise.all([
    BusinessMember.find({ businessId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .populate(memberPopulations)
      .limit(limit),
    BusinessMember.countDocuments({ businessId }),
  ]);

  return { items, total };
};

const findBusinessMemberByBusinessAndId = (
  businessId: string,
  memberId: string,
) =>
  BusinessMember.findOne({ businessId, _id: memberId }).populate(
    memberPopulations,
  );

const updateBusinessMemberRole = (
  businessId: string,
  memberId: string,
  roleId: string,
  updatedByUserId: string,
) =>
  BusinessMember.findOneAndUpdate(
    { _id: memberId, businessId, status: { $ne: "removed" } },
    {
      roleId,
      roleUpdatedByUserId: updatedByUserId,
      roleUpdatedAt: new Date(),
    },
    { returnDocument: "after", runValidators: true },
  ).populate(memberPopulations);

const updateBusinessMemberStatus = (
  businessId: string,
  memberId: string,
  status: "active" | "suspended",
  updatedByUserId: string,
) =>
  BusinessMember.findOneAndUpdate(
    { _id: memberId, businessId, status: { $ne: "removed" } },
    {
      status,
      statusUpdatedByUserId: updatedByUserId,
      statusUpdatedAt: new Date(),
    },
    { returnDocument: "after", runValidators: true },
  ).populate(memberPopulations);

const removeBusinessMember = (
  businessId: string,
  memberId: string,
  removedByUserId: string,
) =>
  BusinessMember.findOneAndUpdate(
    { _id: memberId, businessId, status: { $ne: "removed" } },
    {
      status: "removed",
      removedByUserId,
      removedAt: new Date(),
      statusUpdatedByUserId: removedByUserId,
      statusUpdatedAt: new Date(),
    },
    { returnDocument: "after", runValidators: true },
  ).populate(memberPopulations);

export const businessMemberRepository = {
  createBusinessMember,
  countAssignedMembersByRole,
  findBusinessMemberByBusinessAndId,
  findMembershipByBusinessAndUser,
  findActiveMembershipByBusinessAndUser,
  paginateBusinessMembersByBusinessId,
  findActiveMembershipsByUserId,
  reactivateBusinessMember,
  removeBusinessMember,
  updateBusinessMemberRole,
  updateBusinessMemberStatus,
};

export type BusinessMemberRepository = typeof businessMemberRepository;
