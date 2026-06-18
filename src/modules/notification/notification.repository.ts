import { RepositoryOptions } from "../../repositories/repository-types.js";
import { Notification } from "./notification.model.js";
import {
  CreateNotificationPayload,
  FindNotificationsOptions,
  NotificationFilter,
} from "./notification.types.js";

const createNotification = (
  payload: CreateNotificationPayload,
  options: RepositoryOptions = {},
) =>
  Notification.create([payload], options).then(
    ([notification]) => notification,
  );

const findNotificationsByUserId = (
  userId: string,
  { limit = 50, unreadOnly, ...options }: FindNotificationsOptions = {},
) => {
  const filter: NotificationFilter = { userId };

  if (unreadOnly) {
    filter.readAt = null;
  }

  return Notification.find(filter, null, options)
    .sort({ createdAt: -1 })
    .limit(limit);
};

const markNotificationRead = (
  notificationId: string,
  userId: string,
  options: RepositoryOptions = {},
) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { readAt: new Date() },
    { new: true, ...options },
  );

const markAllNotificationsRead = (
  userId: string,
  options: RepositoryOptions = {},
) =>
  Notification.updateMany(
    { userId, readAt: null },
    { readAt: new Date() },
    options,
  );

export const notificationRepository = {
  createNotification,
  findNotificationsByUserId,
  markAllNotificationsRead,
  markNotificationRead,
};

export type NotificationRepository = typeof notificationRepository;
