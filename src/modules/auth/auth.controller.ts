import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import type { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { clearOAuthStateCookie, setOAuthStateCookie } from "../../utils/cookie.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { ErrorService } from "../error/error.service.js";
import type { AuthService } from "./auth.service.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resendEmailSchema,
  verifyEmailSchema,
  googleCallbackSchema,
} from "./auth.validators.js";
import type { GoogleOAuthService } from "./google-oauth.service.js";

type GetRequestContext =
  typeof import("../../services/ip-location.service.js").getRequestContext;

type SetAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => void;

type ClearAuthCookies = (res: Response) => void;

type AuthControllerDependencies = {
  authService: AuthService;
  errorService: ErrorService;
  auditEventService: AuditEventService;
  getRequestContext: GetRequestContext;
  setAuthCookies: SetAuthCookies;
  clearAuthCookies: ClearAuthCookies;
  createApiError: (statusCode: number, message: string) => ApiError;
  getErrorStatusCode: (error: unknown) => number;
  getErrorMessage: (error: unknown) => string;
  googleOAuthService: GoogleOAuthService;
};

const createAuthController = ({
  authService,
  errorService,
  clearAuthCookies,
  auditEventService,
  getRequestContext,
  setAuthCookies,
  createApiError,
  getErrorStatusCode,
  getErrorMessage,
  googleOAuthService,
}: AuthControllerDependencies) => {
  type GoogleLoginResult =
    | "success"
    | "error"
    | "account_conflict"
    | "account_inactive";

  const redirectToClient = (res: Response, result: GoogleLoginResult) => {
    const url = new URL(env.CLIENT_URL);
    url.searchParams.set("google", result);
    return res.redirect(url.toString());
  };

  const google = asyncHandler(async (_req, res) => {
    const state = googleOAuthService.createState();
    setOAuthStateCookie(res, "google", state);
    return res.redirect(googleOAuthService.getAuthorizationUrl(state));
  });

  const googleCallback = asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error } = googleCallbackSchema.shape.query.parse(req.validatedQuery);
    const storedState = req.cookies?.googleOAuthState;
    clearOAuthStateCookie(res, "google");

    if (error) return redirectToClient(res, "error");
    if (!code || !state || !storedState) {
      throw createApiError(400, "Invalid Google login state");
    }

    const expected = Buffer.from(storedState);
    const received = Buffer.from(state);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      throw createApiError(400, "Invalid Google login state");
    }

    const { requestMetadata, location } = await getRequestContext(req);
    try {
      const result = await authService.loginWithGoogle({
        code,
        nonce: state,
        requestMetadata,
        location,
      });
      setAuthCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      await auditEventService.recordEventSafely({
        eventType: "auth.login.succeeded",
        category: "authentication",
        outcome: "success",
        userId: result.user.id,
        email: result.email,
        userSessionId: result.userSession?.userSessionId,
        authSessionId: result.userSession?.currentAuthSessionId,
        requestMetadata,
        location,
        metadata: { provider: "google" },
        notification: {
          title: "New login detected",
          message: `A Google login was detected from ${requestMetadata.deviceName ?? "an unknown device"}.`,
        },
      });
      return redirectToClient(res, "success");
    } catch (caught) {
      await auditEventService.recordEventSafely({
        eventType: "auth.login.failed",
        category: "authentication",
        outcome: "failure",
        severity: "warning",
        userId: null,
        email: null,
        requestMetadata,
        location,
        reason: "login_failed",
        metadata: { provider: "google" },
      });
      const statusCode =
        typeof caught === "object" && caught !== null && "statusCode" in caught
          ? Number(caught.statusCode)
          : null;
      return redirectToClient(
        res,
        statusCode === 409
          ? "account_conflict"
          : statusCode === 403
            ? "account_inactive"
            : "error",
      );
    }
  });

  const login = asyncHandler(async (req, res) => {
    const { requestMetadata, location } = await getRequestContext(req);

    const body = loginSchema.shape.body.parse(req.validatedBody);
    const { email, password } = body;

    const result = await authService
      .loginUser({
        email,
        requestMetadata,
        location,
        password,
      })
      .catch(async (error: unknown) => {
        await errorService.recordFailedLogin({
          email,
          requestMetadata,
          location,
          error: createApiError(
            getErrorStatusCode(error),
            getErrorMessage(error),
          ),
        });

        throw error;
      });

    const { user, accessToken, refreshToken, userSession } = result;

    setAuthCookies(res, { accessToken, refreshToken });

    await auditEventService.recordEventSafely({
      eventType: "auth.login.succeeded",
      category: "authentication",
      outcome: "success",
      userId: user.id,
      email,
      userSessionId: userSession?.userSessionId,
      authSessionId: userSession?.currentAuthSessionId,
      requestMetadata,
      location,
      notification: {
        title: "New login detected",
        message: `A login was detected from ${requestMetadata.deviceName ?? "an unknown device"}.`,
      },
    });

    return res.status(200).json({
      message: "Login successful",
      user,
    });
  });

  const register = asyncHandler(async (req, res) => {
    const body = registerSchema.shape.body.parse(req.validatedBody);
    const { name, email, password } = body;
    const { user } = await authService.registerUser({
      name,
      email,
      password,
    });

    return res.status(201).json({
      message: "User registered successfully. Check your email for the OTP.",
      user,
    });
  });

  const refresh = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    const {
      accessToken,
      refreshToken: newRefreshToken,
      userSession,
    } = await authService.refreshUserSession({
      refreshToken,
    });

    setAuthCookies(res, {
      accessToken,
      refreshToken: newRefreshToken,
    });

    return res.status(200).json({
      message: "Session refreshed successfully",
      userSession,
    });
  });

  const logout = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    const refreshToken = req.cookies?.refreshToken;

    await authService.logoutUser({ refreshToken, requestMetadata });

    clearAuthCookies(res);

    return res.status(200).json({
      message: "Logout successful",
    });
  });

  const resendEmail = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const body = resendEmailSchema.shape.body.parse(req.validatedBody);
    const { email } = body;

    await authService.resendEmail({ email, requestMetadata });

    return res.status(201).json({ message: "Email sent successfully!" });
  });

  const forgotPassword = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const body = forgotPasswordSchema.shape.body.parse(req.validatedBody);
    const { email } = body;

    await authService.forgotPassword({ email, requestMetadata });

    return res.status(201).json({
      message: "Password reset code sent successfully",
    });
  });

  const resetPassword = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const body = resetPasswordSchema.shape.body.parse(req.validatedBody);
    const { email, otp, newPassword } = body;

    await authService.resetPassword({
      email,
      otp,
      newPassword,
      requestMetadata,
    });

    return res.status(200).json({
      message: "Password reset successfully",
    });
  });

  const verifyEmail = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    const body = verifyEmailSchema.shape.body.parse(req.validatedBody);
    const { otp, email } = body;

    const verifiedUser = await authService.verifyEmail({
      requestMetadata,
      email,
      otp,
    });

    return res.status(200).json({
      message: "Email verified successfully",
      user: verifiedUser,
    });
  });

  const getMe = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      throw createApiError(401, "Authentication required");
    }
    const { user } = await authService.getCurrentUser(req.user.id);

    return res.status(200).json({
      data: user,
      message: "user successfully retrieved",
      success: true,
    });
  });

  return {
    login,
    google,
    googleCallback,
    register,
    getMe,
    forgotPassword,
    logout,
    refresh,
    resetPassword,
    verifyEmail,
    resendEmail,
  };
};

export { createAuthController };
export type AuthController = ReturnType<typeof createAuthController>;
