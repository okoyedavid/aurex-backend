import crypto from "crypto";
import { env } from "../../config/env.js";
import { getRequestMetadata } from "../../utils/request-metadata.js";
import { applicationErrorRepository } from "./application-error.repository.js";
import { createApplicationErrorService } from "./application-error.service.js";

export const applicationErrorService = createApplicationErrorService({
  applicationErrorRepository,
  getRequestMetadata,
  getEnvironment: () => env.NODE_ENV,
  getRelease: () => env.RELEASE,
  createId: () => crypto.randomUUID(),
});
