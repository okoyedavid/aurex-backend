import crypto from "crypto";

import { env } from "../config/env.js";
import { createApplicationError } from "../repositories/application-error.repository.js";
import { getRequestMetadata } from "../utils/request-metadata.js";
import { AppError } from "../middleware/error-handle.middleware.js";
import { Request } from "express";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 12000;

const truncate = (value: string, maxLength: number) => {
  if (typeof value !== "string") {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const normalizeErrorCode = (code: string | number) => {
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }

  return null;
};

const recordApplicationError = async ({
  error,
  req,
  statusCode,
}: {
  error: AppError;
  req: Request;
  statusCode: number;
}) => {
  const requestMetadata = getRequestMetadata(req);

  return createApplicationError({
    errorId: crypto.randomUUID(),
    requestId: req.id as string,
    name: truncate(error.name, 200) ?? "Error",
    message:
      truncate(error.message, MAX_MESSAGE_LENGTH) ?? "Internal server error",
    code: normalizeErrorCode(error.code),
    stack: truncate(error.stack, MAX_STACK_LENGTH),
    statusCode,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id ?? null,
    userSessionId: req.user?.userSessionId ?? null,
    authSessionId: req.user?.sessionId ?? null,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    deviceName: requestMetadata.deviceName,
    environment: env.NODE_ENV,
    release: env.RELEASE,
  });
};

export { recordApplicationError };
