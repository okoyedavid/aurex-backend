import { recordApplicationError } from "../services/application-error.service.js";

import { NextFunction, Request, Response } from "express";

export type AppError = Error & {
  statusCode?: number;
  isOperational?: boolean;
  details?: string;
  code: string | number;
  stack: string;
};

const errorHandler = async (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  console.error(error);

  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    try {
      await recordApplicationError({ error, req, statusCode });
    } catch (trackingError) {
      console.error("Failed to persist application error", trackingError);
    }
  }

  if (res.headersSent) {
    return;
  }

  const responseMessage =
    isServerError && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error.message || "Internal server error";

  return res.status(statusCode).json({
    message: responseMessage,
    requestId: req.id,
    ...(!isServerError && error.details && { details: error.details }),
    ...(process.env.NODE_ENV !== "production" && isServerError
      ? { stack: error.stack }
      : {}),
  });
};

export { errorHandler };
