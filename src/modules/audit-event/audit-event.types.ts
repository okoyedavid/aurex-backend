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
    | "business.member.removed"
    | "business.created"
    | "business.updated"
    | "business.employee.created"
    | "business.employee.updated"
    | "business.employee_type.created"
    | "business.employee_type.updated"
    | "business.employee_group.created"
    | "business.employee_group.updated"
    | "github.connection.connected"
    | "github.connection.disconnected"
    | "github.identity.updated"
    | "github.identity.removed"
    | "github.access.granted"
    | "github.access.revoked"
    | "github.access.pending_acceptance"
    | "github.access.retained_external"
    | "github.access.blocked"
    | "github.access.failed";

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
  businessId?: string | null;
  actorBusinessMemberId?: string | null;
  subjectBusinessMemberId?: string | null;
  employeeId?: string | null;
  subjectType?: CreateAuditEventPayload["subjectType"];
  subjectId?: string | null;

  reason?:
    | "rate_limit_exceeded"
    | "invalid_credentials"
    | "login_failed"
    | "invalid_or_expired_verification_code"
    | "user_not_found"
    | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
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
