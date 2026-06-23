import { QueryOptions } from "mongoose";
import { AuthSession, AuthSessionDocument } from "./auth-session.model.js";
import { RepositoryOptions } from "../../repositories/repository-types.js";

type CreateAuthSession = {
  userId: string;
  userSessionId: string;
  sessionId: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

const createAuthSession = (
  payload: CreateAuthSession,
  options: QueryOptions = {},
) => AuthSession.create([payload], options).then(([doc]) => doc);

const findAuthSessionById = (sessionId: string, options: QueryOptions = {}) =>
  AuthSession.findOne({ sessionId }, null, options);

const findAuthSessionsByUserSessionId = (
  userSessionId: string,
  options: QueryOptions = {},
) => AuthSession.find({ userSessionId }, null, options).sort({ createdAt: -1 });

const findAuthSessionsByUserId = (userId: string, options: QueryOptions = {}) =>
  AuthSession.find({ userId }, null, options).sort({ createdAt: -1 });

const updateAuthSessionById = (
  sessionId: string,
  payload: Partial<AuthSessionDocument>,
  options: QueryOptions = {},
) =>
  AuthSession.findOneAndUpdate({ sessionId }, payload, {
    new: true,
    ...options,
  });

const revokeAuthSessionsByUserSessionId = (
  userSessionId: string,
  options: RepositoryOptions = {},
) =>
  AuthSession.updateMany(
    {
      userSessionId,
      revokedAt: null,
    },
    {
      revokedAt: new Date(),
    },
    options,
  );

const revokeAuthSessionsByUserId = (
  userId: string,
  options: RepositoryOptions = {},
) =>
  AuthSession.updateMany(
    {
      userId,
      revokedAt: null,
    },
    {
      revokedAt: new Date(),
    },
    options,
  );

export const authSessionRepository = {
  createAuthSession,
  findAuthSessionById,
  findAuthSessionsByUserId,
  findAuthSessionsByUserSessionId,
  revokeAuthSessionsByUserId,
  revokeAuthSessionsByUserSessionId,
  updateAuthSessionById,
};

export type AuthSessionRepository = typeof authSessionRepository;
