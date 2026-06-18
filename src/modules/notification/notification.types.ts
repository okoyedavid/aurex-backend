import { Types } from "mongoose";
import { RepositoryOptions } from "../../repositories/repository-types.js";

export type NotificationSeverity = "info" | "warning" | "error" | "critical";

export type CreateNotificationPayload = {
  userId: string;
  auditEventId?: Types.ObjectId;
  type: string;
  title?: string;
  message?: string;
  severity?: NotificationSeverity;
};

export type FindNotificationsOptions = RepositoryOptions & {
  limit?: number;
  unreadOnly?: boolean;
};

export type NotificationFilter = {
  userId: string;
  readAt?: Date | null;
};
