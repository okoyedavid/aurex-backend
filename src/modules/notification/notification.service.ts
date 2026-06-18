import { RepositoryOptions } from "../../repositories/repository-types.js";
import { NotificationRepository } from "./notification.repository.js";
import { CreateNotificationPayload } from "./notification.types.js";

type CreateNotificationServiceDependencies = {
  notificationRepository: NotificationRepository;
};

const createNotificationService = ({
  notificationRepository,
}: CreateNotificationServiceDependencies) => {
  const getUserNotifications = (
    userId: string,
    options: RepositoryOptions = {},
  ) => notificationRepository.findNotificationsByUserId(userId, options);

  const markNotificationRead = (notificationId: string, userId: string) =>
    notificationRepository.markNotificationRead(notificationId, userId);

  const markAllNotificationsRead = (userId: string) =>
    notificationRepository.markAllNotificationsRead(userId);

  const createNotification = async (
    payload: CreateNotificationPayload,
    options: RepositoryOptions,
  ) => {
    return notificationRepository.createNotification(payload, options);
  };

  return {
    getUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    createNotification,
  };
};

export { createNotificationService };
export type NotificationService = ReturnType<typeof createNotificationService>;
