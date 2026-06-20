import {
  ApplicationError,
  CreateApplicationErrorPayload,
} from "./application-error.model.js";

const createApplicationError = (payload: CreateApplicationErrorPayload) =>
  ApplicationError.create(payload);

const markApplicationErrorResolved = (errorId: string) =>
  ApplicationError.findOneAndUpdate(
    { errorId },
    { resolvedAt: new Date() },
    { new: true },
  );

export const applicationErrorRepository = {
  createApplicationError,
  markApplicationErrorResolved,
};

export type ApplicationErrorRepository = typeof applicationErrorRepository;
