import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { notificationController } from "./notification.module.js";
import {
  listNotificationsSchema,
  markAllNotificationsReadSchema,
  markNotificationReadSchema,
} from "./notification.validators.js";

const notificationRouter = Router();

notificationRouter.get(
  "/",
  protect,
  validate(listNotificationsSchema),
  notificationController.listNotifications,
);

notificationRouter.patch(
  "/read-all",
  protect,
  validate(markAllNotificationsReadSchema),
  notificationController.markAllNotificationsRead,
);

notificationRouter.patch(
  "/:notificationId/read",
  protect,
  validate(markNotificationReadSchema),
  notificationController.markNotificationRead,
);

export { notificationRouter };
