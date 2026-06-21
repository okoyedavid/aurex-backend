import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { sensitiveActionLimiter } from "../../middleware/rate-limit.middleware.js";
import { sessionController } from "./session.module.js";
import { validate } from "../../middleware/validate-middleware.js";
import {
  revokeOtherSessionsSchema,
  revokeSessionSchema,
} from "./session.validators.js";

export const sessionRouter = Router();

sessionRouter.get("/me/sessions", protect, sessionController.getMySessions);

sessionRouter.delete(
  "/me/sessions",
  protect,
  sensitiveActionLimiter,
  validate(revokeOtherSessionsSchema),
  sessionController.revokeOtherSessions,
);

sessionRouter.delete(
  "/me/sessions/:userSessionId",
  protect,
  sensitiveActionLimiter,
  validate(revokeSessionSchema),
  sessionController.revokeSession,
);
