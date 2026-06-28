import { RepositoryOptions } from "../../repositories/repository-types.js";
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
) =>
  BusinessMember.findOne({ businessId, userId, status: "active" })
    .populate("businessId")
    .populate("roleId");

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

export const businessMemberRepository = {
  createBusinessMember,
  findBusinessMemberByBusinessAndId,
  findActiveMembershipByBusinessAndUser,
  paginateBusinessMembersByBusinessId,
  findActiveMembershipsByUserId,
};

export type BusinessMemberRepository = typeof businessMemberRepository;
