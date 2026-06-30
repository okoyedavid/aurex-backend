import { asyncHandler } from "../../utils/async-handler.js";
import type { NotificationService } from "./notification.service.js";
import {
  listNotificationsSchema,
  markNotificationReadSchema,
} from "./notification.validators.js";

type CreateNotificationControllerDependencies = {
  notificationService: NotificationService;
};

export const createNotificationController = ({
  notificationService,
}: CreateNotificationControllerDependencies) => {
  const listNotifications = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const query = listNotificationsSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await notificationService.getUserNotifications(
      req.user.id,
      query,
    );

    return res.status(200).json({
      data: result,
      message: "Notifications retrieved",
      success: true,
    });
  });

  const markNotificationRead = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { notificationId } = markNotificationReadSchema.shape.params.parse(
      req.validatedParams,
    );
    const { notification } = await notificationService.markNotificationRead(
      notificationId,
      req.user.id,
    );

    return res.status(200).json({
      data: notification,
      message: "Notification marked as read",
      success: true,
    });
  });

  const markAllNotificationsRead = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const result = await notificationService.markAllNotificationsRead(
      req.user.id,
    );

    return res.status(200).json({
      data: result,
      message: "All notifications marked as read",
      success: true,
    });
  });

  return {
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  };
};
