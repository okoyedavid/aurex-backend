import { ClientSession } from "mongoose";
import {
  LocationMetadata,
  RequestMetadata,
} from "../../types/repository-types.js";
import { TokenService } from "../token/token.service.js";
import { AuthSessionRepository } from "../auth-session/auth-session.repository.js";
import { UserSessionRepository } from "../user-session/user-session.repository.js";
import { WithTransaction } from "../../utils/mongooose-transactions.js";
import { HttpError } from "../../utils/api-error.js";

export type SessionServiceDependencies = {
  tokenService: TokenService;
  authSessionRepository: AuthSessionRepository;
  userSessionRepository: UserSessionRepository;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export type CreateLoginSessionAtomically = {
  userId: string;
  userSessionId: string;
  authSessionId: string;
  refreshToken: string;
  requestMetadata?: RequestMetadata;
  location?: LocationMetadata;
  expiresAt?: Date;
};

export type CreateUserSession = {
  userId: string;
  userSessionId: string;
  currentAuthSessionId: string;
  requestMetadata?: RequestMetadata;
  location?: LocationMetadata;
  expiresAt?: Date;
  mongoSession?: ClientSession | null;
};

export type CreateAuthSession = {
  userId: string;
  userSessionId: string;
  sessionId: string;
  expiresAt?: Date;
  refreshToken: string;
  mongoSession?: ClientSession | null;
};

export type MintSession = {
  userId: string;
  userSessionId: string;
  authSessionId: string;
};
