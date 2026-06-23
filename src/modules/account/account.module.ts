import { getRequestContext } from "../../services/ip-location.service.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { ApiError, createHttpError } from "../../utils/api-error.js";
import { setAuthCookies } from "../../utils/cookie.js";
import { hashService } from "../../utils/hash.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { sessionService } from "../session/session.module.js";
import { userRepository } from "../users/user.repository.js";
import { verificationService } from "../verification/verification.module.js";
import { createAccountController } from "./account.controller.js";
import { createAccountService } from "./account.service.js";

export const accountService = createAccountService({
  userRepository,
  sessionService,
  verificationService,
  auditEventService,
  cloudinaryService,
  withTransaction,
  createHttpError,
  hashService,
});

export const accountController = createAccountController({
  accountService,
  getRequestContext,
  setAuthCookies,
  createApiError: (statusCode, message) => new ApiError(statusCode, message),
});
