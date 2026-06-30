import { ClientSession } from "mongoose";
import {
  LocationMetadata,
  RequestMetadata,
} from "../../types/repository-types.js";
import { NotificationSeverity } from "../notification/notification.types.js";
import { CreateAuditEventPayload } from "./audit-event.model.js";

export type RecordSecurityEvent = {
  eventType:
    | "security.rate_limit.triggered"
    | "auth.login.failed"
    | "auth.login.succeeded"
    | "account.email_verification.succeeded"
    | "account.email_change.failed"
    | "account.email_change.succeeded"
    | "account.email_verification.failed"
    | "account.email_verification.requested"
    | "account.email_change.requested"
    | "account.password_reset.requested"
    | "account.password_reset.failed"
    | "account.password_reset.succeeded"
    | "auth.logout"
    | "auth.sessions.revoked_all_others"
    | "auth.session.revoked"
    | "business.invite.created"
    | "business.invite.resent"
    | "business.invite.revoked"
    | "business.invite.accepted"
    | "business.invite.declined"
    | "business.invite.approval_requested"
    | "business.invite.approved"
    | "business.invite.approval_rejected"
    | "business.membership.activated"
    | "business.member.role_updated"
    | "business.member.status_updated"
    | "business.member.removed";

  category:
    | "security"
    | "authentication"
    | "account"
    | "session"
    | "business";
  outcome: "blocked" | "failure" | "success";
  severity?: NotificationSeverity;
  userId: string | null;
  email: string | null;
  userSessionId?: string | null;
  authSessionId?: string | null;

  reason?:
    | "rate_limit_exceeded"
    | "invalid_credentials"
    | "login_failed"
    | "invalid_or_expired_verification_code"
    | "user_not_found"
    | null;
  metadata?: {
    method?: string;
    path?: string;
    revokedCount?: string | number;
    businessId?: string;
    inviteId?: string;
    roleId?: string;
    memberId?: string;
    status?: string;
  };
  requestMetadata?: Partial<RequestMetadata>;
  location?: Partial<LocationMetadata>;
  notification?: {
    title: string;
    message: string;
    severity?: NotificationSeverity;
  };
  mongoSession?: ClientSession | null;
  changes?: CreateAuditEventPayload["changes"];
};
