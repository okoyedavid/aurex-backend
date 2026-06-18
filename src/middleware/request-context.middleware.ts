import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId.trim().slice(0, 128)
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};

export { requestContext };
