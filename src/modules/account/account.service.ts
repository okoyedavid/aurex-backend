import type {
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  CreateAccountServiceDependencies,
  DeleteAvatarInput,
  GetCurrentUserInput,
  RequestEmailChangeInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  UpdateAvatarInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
  VerifyEmailChangeInput,
} from "./account.types.js";
import { UserDocument } from "../users/user.models.js";

const maskEmail = (email: string | null | undefined) => {
  if (!email || !email.includes("@")) return null;

  const [localPart, domain] = email.split("@");
  return `${localPart?.slice(0, 1)}***@${domain}`;
};

const createAccountService = ({
  userRepository,
  sessionService,
  hashService,
  verificationService,
  auditEventService,
  cloudinaryService,
  withTransaction,
  createHttpError,
}: CreateAccountServiceDependencies) => {
  const getCurrentUser = async ({ userId }: GetCurrentUserInput) => {
    const user = await userRepository.findUserById(userId);

    return { user };
  };

  const updateProfile = async (_input: UpdateProfileInput) => {
    const { userId, bio, name, username } = _input;
    const updateData: Partial<UpdateProfileInput> = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (username !== undefined) {
      updateData.username = username;
    }

    if (bio !== undefined) {
      updateData.bio = bio;
    }

    return userRepository.updateUserById(userId, updateData);
  };

  const deleteCloudinaryImageSafely = async (
    imageUrl: string | null | undefined,
  ) => {
    try {
      await cloudinaryService.deleteImageByUrl(imageUrl);
    } catch (error) {
      console.error("Failed to delete Cloudinary image", error);
    }
  };

  const updateAvatar = async ({ userId, avatar }: UpdateAvatarInput) => {
    const previousUser = await userRepository.findUserById(userId);

    if (!previousUser) {
      throw createHttpError("User not found", 404);
    }

    const updatedUser = await userRepository.updateUserById(userId, {
      avatar,
    });

    if (!updatedUser) {
      throw createHttpError("User not found", 404);
    }

    if (previousUser.avatar && previousUser.avatar !== avatar) {
      await deleteCloudinaryImageSafely(previousUser.avatar);
    }

    return updatedUser;
  };

  const deleteAvatar = async ({ userId }: DeleteAvatarInput) => {
    const previousUser = await userRepository.findUserById(userId);

    if (!previousUser) {
      throw createHttpError("User not found", 404);
    }

    const updatedUser = await userRepository.updateUserById(userId, {
      avatar: null,
    });

    if (!updatedUser) {
      throw createHttpError("User not found", 404);
    }

    await deleteCloudinaryImageSafely(previousUser.avatar);

    return updatedUser;
  };

  const confirmEmailChange = async ({
    userId,
    token,
  }: ConfirmEmailChangeInput) => {
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

  const requestEmailChange = async ({
    userId,
    newEmail,
    requestMetadata,
    userSessionId,
    sessionId,
  }: RequestEmailChangeInput) => {
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
      userSessionId,
      authSessionId: sessionId,
      requestMetadata,
    });
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
        userId,
        email: null,
        userSessionId,
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
      userId,
      email: updatedUser.email,
      userSessionId,
      authSessionId: sessionId,
      requestMetadata,
      changes: {
        fields: ["email"],
        before: { emailMasked: maskEmail(previousUser.email) },
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

  const changePassword = async (_input: ChangePasswordInput) => {
    const {
      userId,
      currentPassword,
      newPassword,
      sessionId,
      userSessionId,
      requestMetadata,
    } = _input;
    const user = await userRepository.findUserByIdWithPassword(userId);

    if (!user) {
      throw createHttpError("User not found", 404);
    }

    const isPasswordValid = await hashService.compareHash(
      currentPassword,
      user.password as string,
    );

    if (!isPasswordValid) {
      throw createHttpError("Invalid password", 401);
    }

    const isSamePassword = await hashService.compareHash(
      newPassword,
      user.password as string,
    );

    if (isSamePassword) {
      throw createHttpError(
        "New password must be different from current password",
        400,
      );
    }

    const resolvedUserSessionId =
      userSessionId ??
      (sessionId
        ? await sessionService.getUserSessionIdFromAuthSessionId(sessionId)
        : null);

    const hashedPassword = await hashService.hashValue(newPassword);

    return withTransaction(async (mongoSession) => {
      await sessionService.revokeUserSession(
        resolvedUserSessionId,
        mongoSession,
      );

      await userRepository.updateUserById(
        userId,
        {
          password: hashedPassword,
        },
        { session: mongoSession },
      );

      const rotatedSession = await sessionService.createLoginSession({
        user,
        requestMetadata,
        mongoSession,
      });

      return {
        accessToken: rotatedSession.accessToken,
        refreshToken: rotatedSession.refreshToken,
        userSession: rotatedSession.userSession,
      };
    });
  };

  const requestPasswordReset = async (_input: RequestPasswordResetInput) => {};

  const resetPassword = async (_input: ResetPasswordInput) => {};

  const updatePreferences = async ({
    userId,
    preferences,
  }: UpdatePreferencesInput) => {
    const user = await userRepository.findUserById(userId);

    if (!user) {
      throw createHttpError("User not found", 404);
    }

    return userRepository.updateUserById(userId, {
      preferences: {
        twoFactorEnabled:
          preferences.twoFactorEnabled ??
          user.preferences?.twoFactorEnabled ??
          false,
      },
    });
  };

  return {
    changePassword,
    deleteAvatar,
    getCurrentUser,
    requestEmailChange,
    requestPasswordReset,
    resetPassword,
    updateAvatar,
    updatePreferences,
    updateProfile,
    verifyEmailChange,
  };
};

export type AccountService = ReturnType<typeof createAccountService>;
export { createAccountService };
