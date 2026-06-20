import {
  ApiError,
  createHttpError,
  getErrorMessage,
  getErrorStatusCode,
} from "../../utils/api-error.js";
import { getRequestContext } from "../../services/ip-location.service.js";
import { setAuthCookies } from "../../utils/cookie.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { errorService } from "../error/error.module.js";
import { hashService } from "../../utils/hash.js";
import { sessionService } from "../session/session.module.js";
import { userRepository } from "../users/user.repository.js";
import { verificationService } from "../verification/verification.module.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthService } from "./auth.service.js";

export const authService = createAuthService({
  userRepository,
  hashService: hashService,
  sessionService,
  verificationService,
  createHttpError,
});

export const authController = createAuthController({
  authService,
  errorService,
  auditEventService,
  getRequestContext,
  setAuthCookies,
  createApiError: (statusCode, message) => new ApiError(statusCode, message),
  getErrorStatusCode,
  getErrorMessage,
});
