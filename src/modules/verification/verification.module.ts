import { createHttpError } from "../../utils/api-error.js";
import { emailService } from "../email/email.module.js";
import { tokenService } from "../token/token.module.js";
import { userRepository } from "../users/user.repository.js";
import { verificationRepository } from "./verification.repository.js";
import { createVerificationService } from "./verification.service.js";

export const verificationService = createVerificationService({
  userRepository,
  tokenService,
  emailService,
  verificationRepository,
  createHttpError,
});
