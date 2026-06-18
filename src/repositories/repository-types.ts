import type { ClientSession, Types } from "mongoose";
import { NotificationSeverity } from "../modules/notification/notification.types.js";
import { CreateAuditEventPayload } from "../modules/audit-event/audit-event.model.js";

export type RepositoryOptions = {
  session?: ClientSession;
};

// SECURITY EVENTS TYPE

export type RequestMetadata = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
};

export type LocationMetadata = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type RecordSecurityEvent = {
  eventType:
    | "security.rate_limit.triggered"
    | "auth.login.failed"
    | "auth.login.succeeded";
  category: "security" | "authentication";
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
