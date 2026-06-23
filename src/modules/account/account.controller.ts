import type { Response } from "express";
import type { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import type { AccountService } from "./account.service.js";
import type {
  AccountPreferencesInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from "./account.types.js";

type GetRequestContext =
  typeof import("../../services/ip-location.service.js").getRequestContext;

type SetAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => void;

type AccountControllerDependencies = {
  accountService: AccountService;
  getRequestContext: GetRequestContext;
  setAuthCookies: SetAuthCookies;
  createApiError: (statusCode: number, message: string) => ApiError;
};

const createAccountController = ({
  accountService,
  getRequestContext,
  setAuthCookies,
  createApiError,
}: AccountControllerDependencies) => {
  const requireUser = (req: Express.Request) => {
    if (!req.user?.id) {
      throw createApiError(401, "Authentication required");
    }

    return req.user;
  };

  const getCurrentUser = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { user } = await accountService.getCurrentUser({
      userId: userContext.id,
    });

    return res.status(200).json({ user });
  });

  const updateProfile = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { name, username, bio } = req.validatedBody as Omit<
      UpdateProfileInput,
      "userId"
    >;

    const user = await accountService.updateProfile({
      userId: userContext.id,
      name,
      username,
      bio,
    });

    return res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  });

  const updateAvatar = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { avatar } = req.validatedBody as { avatar: string };
    const user = await accountService.updateAvatar({
      userId: userContext.id,
      avatar,
    });

    return res.status(200).json({
      message: "Avatar updated successfully",
      user,
    });
  });

  const deleteAvatar = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const user = await accountService.deleteAvatar({
      userId: userContext.id,
    });

    return res.status(200).json({
      message: "Avatar deleted successfully",
      user,
    });
  });

  const requestEmailChange = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);

    if (!userContext.sessionId || !userContext.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const { requestMetadata } = await getRequestContext(req);
    const { newEmail } = req.validatedBody as { newEmail: string };

    await accountService.requestEmailChange({
      userId: userContext.id,
      newEmail,
      sessionId: userContext.sessionId,
      userSessionId: userContext.userSessionId,
      requestMetadata,
    });

    return res.status(201).json({
      message: "OTP sent successfully. Check your new email for the OTP.",
    });
  });

  const verifyEmailChange = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);

    if (!userContext.sessionId || !userContext.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const { requestMetadata } = await getRequestContext(req);
    const { otp } = req.validatedBody as { otp: string };
    const user = await accountService.verifyEmailChange({
      userId: userContext.id,
      otp,
      sessionId: userContext.sessionId,
      userSessionId: userContext.userSessionId,
      requestMetadata,
    });

    return res.status(200).json({
      message: "Email verified and changed successfully",
      user,
    });
  });

  const changePassword = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);

    if (!userContext.sessionId || !userContext.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const { requestMetadata } = await getRequestContext(req);
    const { currentPassword, newPassword } = req.validatedBody as {
      currentPassword: string;
      newPassword: string;
    };
    const { accessToken, refreshToken, userSession } =
      await accountService.changePassword({
        userId: userContext.id,
        currentPassword,
        newPassword,
        sessionId: userContext.sessionId,
        userSessionId: userContext.userSessionId,
        requestMetadata,
      });

    setAuthCookies(res, { accessToken, refreshToken });

    return res.status(200).json({
      message: "Password updated successfully",
      userSession,
    });
  });

  const requestPasswordReset = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const { email } = req.validatedBody as { email: string };

    await accountService.requestPasswordReset({
      email,
      requestMetadata,
    });

    return res.status(201).json({
      message: "Password reset OTP sent successfully",
    });
  });

  const resetPassword = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const { email, otp, newPassword } = req.validatedBody as Omit<
      ResetPasswordInput,
      "requestMetadata"
    >;

    await accountService.resetPassword({
      email,
      otp,
      newPassword,
      requestMetadata,
    });

    return res.status(200).json({
      message: "Password reset successfully",
    });
  });

  const updatePreferences = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { requestMetadata } = await getRequestContext(req);
    const { preferences } = req.validatedBody as {
      preferences: AccountPreferencesInput;
    };
    const user = await accountService.updatePreferences({
      userId: userContext.id,
      preferences,
      requestMetadata,
    });

    return res.status(200).json({
      message: "Preferences updated successfully",
      user,
    });
  });

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

export { createAccountController };
export type AccountController = ReturnType<typeof createAccountController>;
