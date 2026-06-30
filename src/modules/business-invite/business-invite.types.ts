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

export type EmailDeliveryStatus =
  | "pending"
  | "retrying"
  | "sent"
  | "failed";

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
