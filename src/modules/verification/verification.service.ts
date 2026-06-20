import { HttpError } from "../../utils/api-error.js";
import type { EmailService } from "../email/email.service.js";
import { TokenService } from "../token/token.service.js";
import { UserRepository } from "../users/user.repository.js";
import { VerificationRepository } from "./verification.repository.js";
import { CreateVerificationPayload } from "./verification.types.js";

const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;

export type VerificationServiceDependencies = {
  userRepository: UserRepository;
  tokenService: TokenService;
  emailService: EmailService;
  verificationRepository: VerificationRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export type IssueVerificationToken = {
  userId: string;
  email: string;
  name: string;
  purpose?: CreateVerificationPayload["purpose"];
  targetEmail?: string | null;
};

export type VerifyUserToken = {
  userId: string;
  token: string;
  purpose?: CreateVerificationPayload["purpose"];
};

const createVerificationService = ({
  verificationRepository,
  userRepository,
  tokenService,
  emailService,
  createHttpError,
}: VerificationServiceDependencies) => {
  const issueVerificationToken = async ({
    userId,
    email,
    name,
    purpose = "verify_email",
    targetEmail,
  }: IssueVerificationToken) => {
    if (!userId || !email) {
      throw createHttpError("User and email are required", 500);
    }

    await verificationRepository.deleteVerificationTokensForUser(
      userId,
      purpose,
    );

    const { token, tokenHash } = tokenService.createOtpToken();

    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    await verificationRepository.createVerificationToken({
      userId,
      purpose,
      tokenHash,
      expiresAt,
      targetEmail,
    });

    await emailService.sendVerificationOtpEmail({
      to: email,
      name,
      otp: token,
    });

    return {
      expiresAt,
    };
  };

  const verifyUserToken = async ({
    userId,
    token,
    purpose = "verify_email",
  }: VerifyUserToken) => {
    if (!userId || !token) {
      throw createHttpError("User and verification code are required", 400);
    }

    const tokenHash = tokenService.hashToken(token);
    const verificationToken =
      await verificationRepository.findActiveVerificationToken(
        tokenHash,
        purpose,
      );

    if (
      !verificationToken ||
      verificationToken.userId.toString() !== userId.toString()
    ) {
      throw createHttpError("Invalid or expired verification code", 400);
    }

    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw createHttpError("User not found", 404);
    }

    await verificationRepository.markVerificationTokenUsed(tokenHash);

    if (purpose === "verify_email" && !user.emailVerifiedAt) {
      return userRepository.updateUserById(userId, {
        emailVerifiedAt: new Date(),
      });
    }

    return user;
  };

  const verifyChangeEmailToken = async ({
    userId,
    token,
  }: {
    userId: string;
    token: string;
  }) => {
    const user = await verifyUserToken({
      userId,
      token,
      purpose: "change_email",
    });

    const tokenHash = tokenService.hashToken(token);
    const verificationToken =
      await verificationRepository.findVerificationTokenByHash(tokenHash);

    if (!verificationToken?.targetEmail) {
      throw createHttpError("Pending email change was not found", 400);
    }

    return {
      targetEmail: verificationToken.targetEmail,
      user,
    };
  };

  return {
    issueVerificationToken,
    verifyChangeEmailToken,
    verifyUserToken,
  };
};

export { createVerificationService };
export type VerificationService = ReturnType<typeof createVerificationService>;
