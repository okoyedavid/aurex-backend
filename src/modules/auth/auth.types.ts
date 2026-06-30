import z from "zod";
import {
  LocationMetadata,
  RequestMetadata,
} from "../../types/repository-types.js";
import { loginSchema } from "./auth.validators.js";
import { UserRepository } from "../users/user.repository.js";
import { SessionService } from "../session/session.service.js";
import { HashService } from "../../utils/hash.js";
import { WithTransaction } from "../../utils/mongooose-transactions.js";
import { VerificationService } from "../verification/verification.service.js";
import { HttpError } from "../../utils/api-error.js";
import { AuditEventService } from "../audit-event/audit-event.service.js";

export type LoginInput = {
  email: string;
  password: string;
  requestMetadata: RequestMetadata;
  location: LocationMetadata;
};

export type RegisterInput = {
  name: string;
  password: string;
  email: string;
};
export type LoginBody = z.infer<typeof loginSchema>["body"];

export type ResendEmail = {
  email: string;
  requestMetadata: RequestMetadata;
};

export type ForgotPasswordInput = {
  email: string;
  requestMetadata: RequestMetadata;
};

export type ResetPasswordInput = {
  email: string;
  otp: string;
  newPassword: string;
  requestMetadata: RequestMetadata;
};

export type VerifyEmail = {
  otp: string;
  email: string;
  requestMetadata: RequestMetadata;
};

export type AuthServiceDependencies = {
  userRepository: UserRepository;
  sessionService: SessionService;
  hashService: HashService;
  verificationService: VerificationService;
  auditEventService: AuditEventService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
  //   authProviderRepository: AuthProviderRepository;
  //   tokenService: TokenService;
  //   verificationService: VerificationService;
};
