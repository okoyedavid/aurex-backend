import type { RequestMetadata } from "../../types/repository-types.js";
import { HttpError } from "../../utils/api-error.js";
import { HashService } from "../../utils/hash.js";
import { WithTransaction } from "../../utils/mongooose-transactions.js";
import { CloudinaryService } from "../../services/cloudinary.service.js";
import { AuditEventService } from "../audit-event/audit-event.service.js";
import { SessionService } from "../session/session.service.js";
import type { UserRepository } from "../users/user.repository.js";
import { VerificationService } from "../verification/verification.service.js";

export type AccountPreferencesInput = {
  twoFactorEnabled?: boolean;
};

export type CreateAccountServiceDependencies = {
  userRepository: UserRepository;
  sessionService: SessionService;
  verificationService: VerificationService;
  auditEventService: AuditEventService;
  cloudinaryService: CloudinaryService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
  hashService: HashService;
};

export type ConfirmEmailChangeInput = {
  userId: string;
  token: string;
};

export type GetCurrentUserInput = {
  userId: string;
};

export type UpdateProfileInput = {
  userId: string;
  name?: string;
  username?: string | null;
  bio?: string | null;
};

export type UpdateAvatarInput = {
  userId: string;
  avatar: string;
};

export type DeleteAvatarInput = {
  userId: string;
};

export type RequestEmailChangeInput = {
  userId: string;
  newEmail: string;
  sessionId: string;
  userSessionId: string;
  requestMetadata: RequestMetadata;
};

export type VerifyEmailChangeInput = {
  userId: string;
  otp: string;
  sessionId: string;
  userSessionId: string;
  requestMetadata: RequestMetadata;
};

export type ChangePasswordInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
  sessionId: string;
  userSessionId: string;
  requestMetadata: RequestMetadata;
};

export type RequestPasswordResetInput = {
  email: string;
  requestMetadata: RequestMetadata;
};

export type ResetPasswordInput = {
  email: string;
  otp: string;
  newPassword: string;
  requestMetadata: RequestMetadata;
};

export type UpdatePreferencesInput = {
  userId: string;
  preferences: AccountPreferencesInput;
  requestMetadata: RequestMetadata;
};
