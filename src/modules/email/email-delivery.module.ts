import { env } from "../../config/env.js";
import { businessInviteRepository } from "../business-invite/business-invite.repository.js";
import { userRepository } from "../users/user.repository.js";
import { createEmailDeliveryWorker } from "./email-delivery.worker.js";
import { emailService } from "./email.module.js";

const emailWorker = createEmailDeliveryWorker({
  userRepository: userRepository,
  emailService: emailService,
  businessInviteRepository: businessInviteRepository,
  intervalMs: env.VERIFICATION_WORKER_INTERVAL_MS,
  maxAttempts: env.VERIFICATION_MAX_ATTEMPTS,
});

export { emailWorker };
