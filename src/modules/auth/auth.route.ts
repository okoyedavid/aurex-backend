import { Router } from "express";
import { validate } from "../../middleware/validate-middleware.js";
import { authController } from "./auth.module.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resendEmailSchema,
  refreshSchema,
  verifyEmailSchema,
  logoutSchema,
} from "./auth.validators.js";
import {
  emailDeliveryLimiter,
  otpLimiter,
  refreshLimiter,
  loginIpLimiter,
  loginIdentityLimiter,
} from "../../middleware/rate-limit.middleware.js";
import { protect } from "../../middleware/auth.middleware.js";

const authRouter = Router();

authRouter.get("/me", protect, authController.getMe);

authRouter.post(
  "/login",
  loginIpLimiter,
  loginIdentityLimiter,
  validate(loginSchema),
  authController.login,
);
authRouter.post("/register", validate(registerSchema), authController.register);

authRouter.post(
  "/refresh",
  refreshLimiter,
  validate(refreshSchema),
  authController.refresh,
);

authRouter.post("/logout", validate(logoutSchema), authController.logout);

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

authRouter.post(
  "/password/forgot",
  emailDeliveryLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

authRouter.patch(
  "/password/reset",
  otpLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

// authRouter.get("/google", redirectToGoogle);
// authRouter.get("/google/callback", loginWithGoogleCallback);
// authRouter.get("/github", redirectToGitHub);
// authRouter.get("/github/callback", loginWithGitHub);

// authRouter.post(
//   "/reset-password",
//   protect,
//   sensitiveActionLimiter,
//   validate(passwordResetSchema),
//   resetPassword,
// );

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
