// src/middlewares/mongo-sanitize.middleware.ts
import type { RequestHandler } from "express";

const dangerousMongoKeyPattern = /^\$|\./;

function sanitizeMongoObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMongoObject);
  }

  if (value && typeof value === "object") {
    const cleanObject: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (dangerousMongoKeyPattern.test(key)) {
        continue;
      }

      cleanObject[key] = sanitizeMongoObject(nestedValue);
    }

    return cleanObject;
  }

  return value;
}

export const mongoSanitizeMiddleware: RequestHandler = (req, _res, next) => {
  if (req.body) {
    req.body = sanitizeMongoObject(req.body);
  }

  if (req.params) {
    req.params = sanitizeMongoObject(req.params) as typeof req.params;
  }

  // Do not assign to req.query in Express 5.
  // If you need sanitized query values, sanitize them inside the specific controller/service.

  next();
};
