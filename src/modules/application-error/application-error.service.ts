import type { AppError } from "../../middleware/error-handle.middleware.js";
import type { Request } from "express";
import type { ApplicationErrorRepository } from "./application-error.repository.js";

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

type RecordApplicationErrorPayload = {
  error: AppError;
  req: Request;
  statusCode: number;
};

type CreateApplicationErrorServiceDependencies = {
  applicationErrorRepository: ApplicationErrorRepository;
  getRequestMetadata: (req: Request) => {
    ipAddress: string | null;
    userAgent: string | null;
    deviceName: string | null;
  };
  getEnvironment: () => string;
  getRelease: () => string | null;
  createId: () => string;
};

const createApplicationErrorService = ({
  applicationErrorRepository,
  getRequestMetadata,
  getEnvironment,
  getRelease,
  createId,
}: CreateApplicationErrorServiceDependencies) => {
  const recordApplicationError = async ({
    error,
    req,
    statusCode,
  }: RecordApplicationErrorPayload) => {
    const requestMetadata = getRequestMetadata(req);

    return applicationErrorRepository.createApplicationError({
      errorId: createId(),
      requestId: req.id ?? createId(),
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
      environment: getEnvironment(),
      release: getRelease(),
    });
  };

  return {
    recordApplicationError,
  };
};

export { createApplicationErrorService };
export type ApplicationErrorService = ReturnType<
  typeof createApplicationErrorService
>;
