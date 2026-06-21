import { ClientSession } from "mongoose";
import {
  LocationMetadata,
  RequestMetadata,
} from "../../repositories/repository-types.js";
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
    | "account.email_change.requested";

  category: "security" | "authentication" | "account";
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
    | null;
  metadata?: {
    method: string;
    path: string;
  };
  requestMetadata?: Partial<RequestMetadata>;
  location?: Partial<LocationMetadata>;
  notification?: Partial<{
    title: string;
    message: string;
    severity: NotificationSeverity;
  }>;
  mongoSession?: ClientSession | null;
  changes?: CreateAuditEventPayload["changes"];
};
