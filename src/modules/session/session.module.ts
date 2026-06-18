import { createHttpError } from "../../utils/api-error.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { authSessionRepository } from "../auth-session/auth-session.repository.js";
import { createSessionService } from "../session/session.service.js";
import { tokenService } from "../token/token.module.js";
import { userSessionRepository } from "../user-session/user-session.repository.js";

export const sessionService = createSessionService({
  tokenService,
  authSessionRepository,
  userSessionRepository,
  withTransaction,
  createHttpError,
});
