import type { HydratedDocument, Types } from "mongoose";
import type { BusinessInviteDocument } from "./business-invite.model.js";

export type CreateBusinessInvitePayload = {
  businessId: string;
  invitedByUserId: string;
  email: string;
  roleId: string;
};

export type PersistBusinessInvitePayload = CreateBusinessInvitePayload & {
  tokenHash: string;
};

export type BusinessInviteStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "revoked"
  | "expired";

export type EmailDeliveryStatus = "pending" | "retrying" | "sent" | "failed";

export type InviteApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type InvitePaginationInput = {
  page: number;
  limit: number;
  status?: BusinessInviteStatus;
};

type PopulatedUserRef = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  avatar?: string;
};

type PopulatedBusinessRef = {
  _id: Types.ObjectId;
  name: string;
  industry?: string;
  profile_img?: string;
};

type PopulatedRoleRef = {
  _id: Types.ObjectId;
  name: string;
  key: string;
  type: string;
  permissions: string[];
  deniedPermissions: string[];
};

export type PopulatedBusinessInviteDocument = Omit<
  HydratedDocument<BusinessInviteDocument>,
  "businessId" | "roleId" | "invitedByUserId"
> & {
  businessId: PopulatedBusinessRef;
  roleId: PopulatedRoleRef;
  invitedByUserId: PopulatedUserRef;
};
