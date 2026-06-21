import { Router } from "express";
import { validate } from "../../middleware/validate-middleware.js";
import { authController } from "./auth.module.js";
import {
  changeEmailSchema,
  loginSchema,
  registerSchema,
  resendEmailSchema,
  verifyEmailChangeSchema,
  verifyEmailSchema,
} from "./auth.validators.js";
import {
  emailDeliveryLimiter,
  otpLimiter,
  loginIpLimiter,
  loginIdentityLimiter,
} from "../../middleware/rate-limit.middleware.js";

const authRouter = Router();

authRouter.post(
  "/login",
  loginIpLimiter,
  loginIdentityLimiter,
  validate(loginSchema),
  authController.login,
);
authRouter.post("/register", validate(registerSchema), authController.register);

authRouter.patch(
  "/change-email",
  otpLimiter,
  validate(verifyEmailChangeSchema),
  authController.verifyEmailChange,
);

authRouter.post(
  "/change-email",
  emailDeliveryLimiter,
  validate(changeEmailSchema),
  authController.changeEmail,
);

authRouter.post(
  "/verify-email",
  otpLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail,
);

authRouter.post(
  "/resend-email",
  emailDeliveryLimiter,
  validate(resendEmailSchema),
  authController.resendEmail,
);

// authRouter.patch(
//   "/change-email",
//   protect,
//   otpLimiter,
//   validate(verifyEmailChangeSchema),
//   verifyEmailChange,
// );
// authRouter.post(
//   "/change-email",
//   protect,
//   emailDeliveryLimiter,
//   validate(changeEmailSchema),
//   changeEmail,
// );

// authRouter.get("/google", redirectToGoogle);
// authRouter.get("/google/callback", loginWithGoogleCallback);
// authRouter.get("/github", redirectToGitHub);
// authRouter.get("/github/callback", loginWithGitHub);
// authRouter.post("/refresh", refreshLimiter, validate(refreshSchema), refresh);
// authRouter.post(
//   "/reset-password",
//   protect,
//   sensitiveActionLimiter,
//   validate(passwordResetSchema),
//   resetPassword,
// );

// authRouter.post("/logout", validate(logoutSchema), logout);
// authRouter.get("/me", protect, getMe);
// authRouter.get("/me/sessions", protect, getMySessions);
// authRouter.get(
//   "/me/audit-events",
//   protect,
//   validate(listSecurityRecordsSchema),
//   getMyAuditEvents,
// );
// authRouter.get(
//   "/me/notifications",
//   protect,
//   validate(listSecurityRecordsSchema),
//   getMyNotifications,
// );
// authRouter.patch(
//   "/me/notifications/read-all",
//   protect,
//   validate(readAllNotificationsSchema),
//   readAllNotifications,
// );
// authRouter.patch(
//   "/me/notifications/:notificationId/read",
//   protect,
//   validate(readNotificationSchema),
//   readNotification,
// );
// authRouter.delete(
//   "/me/sessions",
//   protect,
//   sensitiveActionLimiter,
//   validate(revokeOtherSessionsSchema),
//   revokeOtherSessions,
// );
// authRouter.delete(
//   "/me/sessions/:userSessionId",
//   protect,
//   sensitiveActionLimiter,
//   validate(revokeSessionSchema),
//   revokeSession,
// );
// authRouter.patch(
//   "/me",
//   protect,
//   upload.single("avatar"),
//   validate(updateUserSchema),
//   updateUser,
// );
// authRouter.get("/me/providers", protect, getProviders);
// authRouter.delete(
//   "/disconnect-provider/:provider",
//   protect,
//   validate(deleteProviderSchema),
//   disconnectProvider,
// );

export { authRouter };
