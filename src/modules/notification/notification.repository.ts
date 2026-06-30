import { RepositoryOptions } from "../../types/repository-types.js";
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
  Notification.create([payload], options).then(([notification]) => {
    if (!notification) {
      throw new Error("Failed to create notification");
    }

    return notification;
  });

const paginateNotificationsByUserId = async (
  userId: string,
  { page, limit, unreadOnly, ...options }: FindNotificationsOptions,
) => {
  const filter: NotificationFilter = { userId };

  if (unreadOnly) {
    filter.readAt = null;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter, null, options)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, readAt: null }),
  ]);

  return { items, total, unreadCount };
};

const markNotificationRead = (
  notificationId: string,
  userId: string,
  options: RepositoryOptions = {},
) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    [{ $set: { readAt: { $ifNull: ["$readAt", "$$NOW"] } } }],
    { returnDocument: "after", updatePipeline: true, ...options },
  );

const markAllNotificationsRead = (
  userId: string,
  options: RepositoryOptions = {},
) =>
  Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
    options,
  );

export const notificationRepository = {
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
  paginateNotificationsByUserId,
};

export type NotificationRepository = typeof notificationRepository;
