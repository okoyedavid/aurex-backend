import { RepositoryOptions } from "../../types/repository-types.js";
import type { HttpError } from "../../utils/api-error.js";
import { NotificationRepository } from "./notification.repository.js";
import {
  CreateNotificationPayload,
  FindNotificationsOptions,
} from "./notification.types.js";

type CreateNotificationServiceDependencies = {
  notificationRepository: NotificationRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const createNotificationService = ({
  notificationRepository,
  createHttpError,
}: CreateNotificationServiceDependencies) => {
  const getUserNotifications = async (
    userId: string,
    options: FindNotificationsOptions,
  ) => {
    const { items, total, unreadCount } =
      await notificationRepository.paginateNotificationsByUserId(
        userId,
        options,
      );

    return {
      items,
      unreadCount,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  };

  const markNotificationRead = async (
    notificationId: string,
    userId: string,
  ) => {
    const notification = await notificationRepository.markNotificationRead(
      notificationId,
      userId,
    );

    if (!notification) {
      throw createHttpError("Notification not found", 404);
    }

    return { notification };
  };

  const markAllNotificationsRead = async (userId: string) => {
    const result = await notificationRepository.markAllNotificationsRead(userId);
    return { updatedCount: result.modifiedCount };
  };

  const createNotification = (
    payload: CreateNotificationPayload,
    options: RepositoryOptions = {},
  ) => notificationRepository.createNotification(payload, options);

  return {
    createNotification,
    getUserNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  };
};

export { createNotificationService };
export type NotificationService = ReturnType<typeof createNotificationService>;
