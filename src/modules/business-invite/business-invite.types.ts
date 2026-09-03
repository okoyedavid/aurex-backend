import type { HydratedDocument, Types } from "mongoose";
import type { BusinessInviteDocument } from "./business-invite.model.js";
import type { CreateEmployeeInput } from "../employee/employee.types.js";

export type CreateBusinessInvitePayload = {
  businessId: string;
  invitedByUserId: string;
  email: string;
  roleId: string;

  type?: "MEMBER" | "EMPLOYEE";
  employeeId?: string | null;
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

export type ApproveInviteEmployeeInput = CreateEmployeeInput & {
  employeeListId: string;
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

export type InviteMembershipRole = {
  id: string;
  name: string;
  key: string;
  type: string;
  permissions: string[];
  deniedPermissions: string[];
};

export type InviteMembershipContext = {
  membershipId: string | null;
  status: "none" | "active" | "suspended" | "removed";
  currentRole: InviteMembershipRole | null;
  roleOutcome:
    | "apply_requested"
    | "preserve_current"
    | "blocked_suspended"
    | "blocked_existing_member";
};

type PopulatedEmployeeRef = {
  _id: Types.ObjectId;
  fullName: string;
  jobTitle?: string;
  employeeListId: {
    _id: Types.ObjectId;
    name: string;
  };
  employeeTypeId?: Types.ObjectId | null;
  groupIds: Types.ObjectId[];
  employmentStartDate?: Date | null;
  state?: string | null;
  businessMemberId?: Types.ObjectId | null;
  status: string;
  accountVerificationStatus: string;
};

export type PopulatedBusinessInviteDocument = Omit<
  HydratedDocument<BusinessInviteDocument>,
  "businessId" | "roleId" | "invitedByUserId" | "employeeId"
> & {
  businessId: PopulatedBusinessRef;
  roleId: PopulatedRoleRef;
  invitedByUserId: PopulatedUserRef;
  employeeId: PopulatedEmployeeRef | null;
};
