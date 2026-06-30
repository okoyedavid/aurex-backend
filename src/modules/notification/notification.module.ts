import { notificationRepository } from "./notification.repository.js";
import { createNotificationService } from "./notification.service.js";

export const notificationService = createNotificationService({
  notificationRepository,
  createHttpError,
});

export const notificationController = createNotificationController({
  notificationService,
});
import { createHttpError } from "../../utils/api-error.js";
import { createNotificationController } from "./notification.controller.js";
