// src/utils/ApiError.ts
export type HttpError = Error & {
  statusCode: number;
};

export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(statusCode: number, message: string) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const createHttpError = (
  message: string,
  statusCode: number,
): HttpError => Object.assign(new Error(message), { statusCode });

export const getErrorStatusCode = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 500;
};

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Login failed";
