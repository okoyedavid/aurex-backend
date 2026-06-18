import { notificationRepository } from "./notification.repository.js";
import { createNotificationService } from "./notification.service.js";

export const notificationService = createNotificationService({
  notificationRepository,
});
