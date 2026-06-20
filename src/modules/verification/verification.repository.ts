import { QueryFilter } from "mongoose";
import {
  VerificationDocument,
  VerificationToken,
} from "./verification.model.js";
import { CreateVerificationPayload } from "./verification.types.js";

const createVerificationToken = (payload: CreateVerificationPayload) =>
  VerificationToken.create(payload);

const findVerificationTokenByHash = (tokenHash: string) =>
  VerificationToken.findOne({ tokenHash });

const findActiveVerificationToken = (
  tokenHash: string,
  purpose: CreateVerificationPayload["purpose"],
) =>
  VerificationToken.findOne({
    tokenHash,
    purpose,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

const markVerificationTokenUsed = (tokenHash: string) =>
  VerificationToken.findOneAndUpdate(
    { tokenHash },
    { usedAt: new Date() },
    { new: true },
  );

const deleteVerificationTokensForUser = (
  userId: string,
  purpose: CreateVerificationPayload["purpose"],
) => {
  const query: QueryFilter<VerificationDocument> = {
    userId,
    usedAt: null,
  };

  if (purpose) {
    query.purpose = purpose;
  }

  return VerificationToken.deleteMany(query);
};

export const verificationRepository = {
  createVerificationToken,
  deleteVerificationTokensForUser,
  findActiveVerificationToken,
  findVerificationTokenByHash,
  markVerificationTokenUsed,
};

export type VerificationRepository = typeof verificationRepository;
