import { RequestMetadata } from "../../types/repository-types.js";
import { jsonWebService } from "../../utils/jwt.js";
import {
  LoginInput,
  RegisterInput,
  AuthServiceDependencies,
  ForgotPasswordInput,
  ResendEmail,
  ResetPasswordInput,
  VerifyEmail,
} from "./auth.types.js";

const createAuthService = ({
  userRepository,
  hashService,
  sessionService,
  verificationService,
  auditEventService,
  withTransaction,
  createHttpError,
  // authProviderRepository,
  // tokenService,
}: AuthServiceDependencies) => {
  const loginUser = async ({
    email,
    password,
    requestMetadata,
    location,
  }: LoginInput) => {
    const user = await userRepository.findUserByEmailWithPassword(email);
    if (!user) throw createHttpError("Invalid Credentials!", 401);

    const isPasswordValid = await hashService.compareHash(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      throw createHttpError("Invalid credentials", 401);
    }

    const { password: _password, ...safeUserObject } = user.toObject();
    const safeUser = {
      ...safeUserObject,
      id: user.id,
    };

    const { accessToken, refreshToken, userSession } =
      await sessionService.createLoginSession({
        user,
        requestMetadata,
        location,
      });

    return { accessToken, refreshToken, user: safeUser, userSession };
  };

  const registerUser = async ({ name, email, password }: RegisterInput) => {
    const existingUser = await userRepository.findUserByEmail(email);
    if (existingUser) {
      throw createHttpError("Email already in use", 409);
    }

    const hashedPassword = await hashService.hashValue(password);

    const user = await userRepository.createUser({
      name,
      email,
      password: hashedPassword,
    });

    try {
      await verificationService.issueVerificationToken({
        userId: user.id,
        email,
        name,
        purpose: "verify_email",
      });
    } catch (error) {
      await userRepository.deleteUserById(user.id);
      throw error;
    }

    return {
      user,
    };
  };

  const verifyEmail = async ({ email, requestMetadata, otp }: VerifyEmail) => {
    const user = await userRepository.findUserByEmail(email);

    if (!user) {
      await auditEventService.recordEventSafely({
        eventType: "account.email_verification.failed",
        category: "account",
        outcome: "failure",
        severity: "warning",
        email,
        userId: null,
        requestMetadata,
        reason: "invalid_or_expired_verification_code",
      });
      throw createHttpError("User not found", 404);
    }

    let verifiedUser;

    try {
      verifiedUser = await verificationService.verifyUserToken({
        userId: user.id,
        token: otp,
      });
    } catch (error) {
      await auditEventService.recordEventSafely({
        eventType: "account.email_verification.failed",
        category: "account",
        outcome: "failure",
        severity: "warning",
        userId: user.id,
        email,
        requestMetadata,
        reason: "invalid_or_expired_verification_code",
      });
      throw error;
    }

    await auditEventService.recordEventSafely({
      eventType: "account.email_verification.succeeded",
      category: "account",
      outcome: "success",
      userId: user.id,
      email,
      requestMetadata,
    });

    return verifiedUser;
  };

  const resendEmail = async ({ email, requestMetadata }: ResendEmail) => {
    const user = await userRepository.findUserByEmail(email);

    if (!user) {
      throw createHttpError("User not found", 404);
    }

    const verificationToken = await verificationService.issueVerificationToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      purpose: "verify_email",
    });

    await auditEventService.recordEventSafely({
      eventType: "account.email_verification.requested",
      category: "account",
      outcome: "success",
      userId: user?.id ?? null,
      email,
      requestMetadata,
    });

    return verificationToken;
  };

  const forgotPassword = async ({
    email,
    requestMetadata,
  }: ForgotPasswordInput) => {
    const user = await userRepository.findUserByEmail(email);

    if (!user) {
      await auditEventService.recordEventSafely({
        eventType: "account.password_reset.requested",
        category: "account",
        outcome: "failure",
        severity: "warning",
        userId: null,
        email,
        requestMetadata,
        reason: "user_not_found",
      });

      return;
    }

    await verificationService.issueVerificationToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      purpose: "reset_password",
    });

    await auditEventService.recordEventSafely({
      eventType: "account.password_reset.requested",
      category: "account",
      outcome: "success",
      severity: "warning",
      userId: user.id,
      email,
      requestMetadata,
    });
  };

  const resetPassword = async ({
    email,
    otp,
    newPassword,
    requestMetadata,
  }: ResetPasswordInput) => {
    const user = await userRepository.findUserByEmailWithPassword(email);

    if (!user) {
      await auditEventService.recordEventSafely({
        eventType: "account.password_reset.failed",
        category: "account",
        outcome: "failure",
        severity: "warning",
        userId: null,
        email,
        requestMetadata,
        reason: "invalid_or_expired_verification_code",
      });
      throw createHttpError("Invalid or expired verification code", 400);
    }

    try {
      await verificationService.verifyUserToken({
        userId: user.id,
        token: otp,
        purpose: "reset_password",
      });
    } catch (error) {
      await auditEventService.recordEventSafely({
        eventType: "account.password_reset.failed",
        category: "account",
        outcome: "failure",
        severity: "warning",
        userId: user.id,
        email,
        requestMetadata,
        reason: "invalid_or_expired_verification_code",
      });
      throw error;
    }

    const isSamePassword = await hashService.compareHash(
      newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw createHttpError(
        "New password must be different from current password",
        400,
      );
    }

    const hashedPassword = await hashService.hashValue(newPassword);

    const { revokedCount } = await withTransaction(async (mongoSession) => {
      await userRepository.updateUserById(
        user.id,
        {
          password: hashedPassword,
        },
        { session: mongoSession },
      );

      return sessionService.revokeAllUserSessions(user.id, mongoSession);
    });

    await auditEventService.recordEventSafely({
      eventType: "account.password_reset.succeeded",
      category: "account",
      outcome: "success",
      severity: "warning",
      userId: user.id,
      email,
      requestMetadata,
      metadata: { revokedCount },
      notification: {
        title: "Password reset",
        message: "Your account password was reset successfully.",
        severity: "warning",
      },
    });
  };

  const refreshUserSession = async ({
    refreshToken,
  }: {
    refreshToken: string;
  }) => {
    if (!refreshToken) {
      throw createHttpError("Refresh token is required", 401);
    }

    const { payload, userSession } =
      await sessionService.validateAuthSession(refreshToken);
    const user = await userRepository.findUserById(payload.userId);

    if (!user) {
      await sessionService.revokeUserSession(userSession.userSessionId);
      throw createHttpError("User not found", 404);
    }

    const rotatedSession = await sessionService.rotateLoginSession({
      user,
      userSession,
      oldAuthSessionId: payload.sessionId,
      oldRefreshToken: refreshToken,
    });

    return rotatedSession;
  };

  const logoutUser = async ({
    refreshToken,
    requestMetadata,
  }: {
    refreshToken: string;
    requestMetadata: RequestMetadata;
  }) => {
    if (!refreshToken) {
      throw createHttpError("Refresh token is required", 401);
    }

    const payload = jsonWebService.verifyRefreshToken(refreshToken);
    const userSessionId =
      payload.userSessionId ??
      (payload.sessionId
        ? await sessionService.getUserSessionIdFromAuthSessionId(
            payload.sessionId,
          )
        : null);

    if (payload?.userId) {
      await sessionService.revokeUserSession(userSessionId);
      await auditEventService.recordEventSafely({
        eventType: "auth.logout",
        category: "authentication",
        outcome: "success",
        userId: payload.userId,
        userSessionId: payload.userSessionId,
        authSessionId: payload.sessionId,
        requestMetadata,
        email: null,
      });
    }
  };

  const getCurrentUser = async (userId: string) => {
    const user = await userRepository.findUserById(userId);

    return { user };
  };

  return {
    loginUser,
    registerUser,
    logoutUser,
    forgotPassword,
    getCurrentUser,
    resetPassword,
    verifyEmail,
    refreshUserSession,
    resendEmail,
  };
};

export { createAuthService };
export type AuthService = ReturnType<typeof createAuthService>;
