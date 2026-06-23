import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import {
  emailDeliveryLimiter,
  otpLimiter,
  sensitiveActionLimiter,
} from "../../middleware/rate-limit.middleware.js";
import { accountController } from "./account.module.js";
import {
  changePasswordSchema,
  deleteAvatarSchema,
  requestEmailChangeSchema,
  updateAvatarSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailChangeSchema,
} from "./account.validators.js";

const accountRouter = Router();

accountRouter.patch(
  "/me",
  protect,
  validate(updateProfileSchema),
  accountController.updateProfile,
);

accountRouter.patch(
  "/me/avatar",
  protect,
  validate(updateAvatarSchema),
  accountController.updateAvatar,
);

accountRouter.delete(
  "/me/avatar",
  protect,
  validate(deleteAvatarSchema),
  accountController.deleteAvatar,
);

accountRouter.patch(
  "/me/preferences",
  protect,
  validate(updatePreferencesSchema),
  accountController.updatePreferences,
);

accountRouter.post(
  "/me/email/change",
  protect,
  emailDeliveryLimiter,
  validate(requestEmailChangeSchema),
  accountController.requestEmailChange,
);

accountRouter.patch(
  "/me/email/change",
  protect,
  otpLimiter,
  validate(verifyEmailChangeSchema),
  accountController.verifyEmailChange,
);

accountRouter.patch(
  "/me/password",
  protect,
  sensitiveActionLimiter,
  validate(changePasswordSchema),
  accountController.changePassword,
);

export { accountRouter };
