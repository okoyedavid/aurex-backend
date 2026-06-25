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

export const businessMemberRepository = {
  createBusinessMember,
  findActiveMembershipByBusinessAndUser,
  findActiveMembershipsByUserId,
};

export type BusinessMemberRepository = typeof businessMemberRepository;
