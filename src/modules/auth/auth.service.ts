import { UserDocument } from "../users/user.models.js";
import {
  LoginInput,
  RegisterInput,
  AuthServiceDependencies,
  ValidateEmailChange,
  ResendEmail,
  VerifyEmail,
  SendNewEmailCode,
  VerifyEmailChangeInput,
} from "./auth.types.js";

const maskEmail = (email: string | null | undefined) => {
  if (!email || !email.includes("@")) return null;

  const [localPart, domain] = email.split("@");
  return `${localPart?.slice(0, 1)}***@${domain}`;
};

const createAuthService = ({
  userRepository,
  hashService,
  sessionService,
  verificationService,
  auditEventService,
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

  const confirmEmailChange = async ({ userId, token }: ValidateEmailChange) => {
    const { targetEmail } = await verificationService.verifyChangeEmailToken({
      userId,
      token,
    });

    const existingUser = await userRepository.findUserByEmail(targetEmail);
    if (existingUser && existingUser.id !== userId) {
      throw createHttpError("Email already in use", 409);
    }

    return userRepository.updateUserById(userId, {
      email: targetEmail,
      emailVerifiedAt: new Date(),
    });
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

  const verifyEmailChange = async ({
    otp,
    userId,
    userSessionId,
    sessionId,
    requestMetadata,
  }: VerifyEmailChangeInput) => {
    const previousUser = await userRepository.findUserById(userId);

    if (!previousUser) {
      throw createHttpError("User not found", 404);
    }
    let updatedUser: UserDocument;

    try {
      const changedUser = await confirmEmailChange({
        userId,
        token: otp,
      });

      if (!changedUser) {
        throw createHttpError("User not found", 404);
      }

      updatedUser = changedUser;
    } catch (error) {
      await auditEventService.recordEventSafely({
        eventType: "account.email_change.failed",
        category: "account",
        outcome: "failure",
        severity: "warning",
        userId: userId,
        email: null,
        userSessionId: userSessionId,
        authSessionId: sessionId,
        requestMetadata,
        reason: "invalid_or_expired_verification_code",
      });
      throw error;
    }

    await auditEventService.recordEventSafely({
      eventType: "account.email_change.succeeded",
      category: "account",
      outcome: "success",
      userId: userId,
      email: updatedUser.email,
      userSessionId: userSessionId,
      authSessionId: sessionId,
      requestMetadata,
      changes: {
        fields: ["email"],
        before: { emailMasked: maskEmail(previousUser?.email) },
        after: { emailMasked: maskEmail(updatedUser.email) },
      },
      notification: {
        title: "Email address changed",
        message: "Your account email address was changed.",
        severity: "warning",
      },
    });

    return updatedUser;
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

  const sendNewEmailCode = async ({
    userId,
    userSessionId,
    sessionId,
    newEmail,
    requestMetadata,
  }: SendNewEmailCode) => {
    const user = await userRepository.findUserById(userId);

    if (!user) {
      throw createHttpError("User not found", 404);
    }

    if (user.email === newEmail) {
      throw createHttpError("New email must be different", 400);
    }

    const existingUser = await userRepository.findUserByEmail(newEmail);
    if (existingUser) {
      throw createHttpError("Email already in use", 409);
    }

    await verificationService.issueVerificationToken({
      userId: user.id,
      email: newEmail,
      name: user.name,
      purpose: "change_email",
      targetEmail: newEmail,
    });

    await auditEventService.recordEventSafely({
      eventType: "account.email_change.requested",
      category: "account",
      outcome: "success",
      userId,
      email: newEmail,
      userSessionId: userSessionId,
      authSessionId: sessionId,
      requestMetadata,
    });
  };

  return {
    loginUser,
    registerUser,
    verifyEmailChange,
    sendNewEmailCode,
    verifyEmail,
    resendEmail,
  };
};

export { createAuthService };
export type AuthService = ReturnType<typeof createAuthService>;
