import { getRequestContext } from "../../services/ip-location.service.js";
import { ApiError, createHttpError } from "../../utils/api-error.js";
import { clearAuthCookies } from "../../utils/cookie.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { authSessionRepository } from "../auth-session/auth-session.repository.js";
import { createSessionService } from "../session/session.service.js";
import { tokenService } from "../token/token.module.js";
import { userSessionRepository } from "../user-session/user-session.repository.js";
import { createSessionController } from "./session.controller.js";

export const sessionService = createSessionService({
  tokenService,
  authSessionRepository,
  userSessionRepository,
  withTransaction,
  createHttpError,
});

export const sessionController = createSessionController({
  getRequestContext,
  clearAuthCookies,
  createApiError: (statusCode, message) => new ApiError(statusCode, message),
  sessionService,
});
