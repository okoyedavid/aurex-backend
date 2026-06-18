import {
  ApplicationError,
  CreateApplicationErrorPayload,
} from "../models/application-error.model.js";

const createApplicationError = (payload: CreateApplicationErrorPayload) =>
  ApplicationError.create(payload);

const markApplicationErrorResolved = (errorId: string) =>
  ApplicationError.findOneAndUpdate(
    { errorId },
    { resolvedAt: new Date() },
    { new: true },
  );

export { createApplicationError, markApplicationErrorResolved };
