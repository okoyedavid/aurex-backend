import { QueryFilter, QueryOptions } from "mongoose";
import { UserSession, UserSessionDocument } from "./user-session.model.js";
import { RepositoryOptions } from "../../repositories/repository-types.js";

type CreateUserSession = {
  userId: string;
  userSessionId: string;
  currentAuthSessionId: string;
  userAgent: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  expiresAt: Date;
};

const createUserSession = (
  payload: CreateUserSession,
  options: QueryOptions = {},
) => UserSession.create([payload], options).then(([doc]) => doc);

const findUserSessionById = (
  userSessionId: string,
  options: QueryOptions = {},
) => UserSession.findOne({ userSessionId }, null, options);

const findActiveUserSessionById = (
  userSessionId: string,
  options: QueryOptions = {},
) =>
  UserSession.findOne(
    {
      userSessionId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    null,
    options,
  );

const findUserSessionsByUserId = (userId: string, options: QueryOptions = {}) =>
  UserSession.find({ userId }, null, options).sort({
    lastSeenAt: -1,
    createdAt: -1,
  });

const updateUserSessionById = (
  userSessionId: string,
  payload: Partial<UserSessionDocument>,
  options: QueryOptions = {},
) =>
  UserSession.findOneAndUpdate({ userSessionId }, payload, {
    new: true,
    ...options,
  });

const revokeUserSessionsByUserId = (
  userId: string,
  excludeUserSessionId: string | null = null,
  options: RepositoryOptions = {},
) => {
  const filter: QueryFilter<UserSessionDocument> = {
    userId,
    revokedAt: null,
  };

  if (excludeUserSessionId) {
    filter.userSessionId = { $ne: excludeUserSessionId };
  }

  return UserSession.updateMany(
    filter,
    {
      revokedAt: new Date(),
      currentAuthSessionId: null,
    },
    options,
  );
};

export const userSessionRepository = {
  createUserSession,
  findActiveUserSessionById,
  findUserSessionById,
  findUserSessionsByUserId,
  revokeUserSessionsByUserId,
  updateUserSessionById,
};

export type UserSessionRepository = typeof userSessionRepository;
