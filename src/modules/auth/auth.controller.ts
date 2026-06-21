import type { Response } from "express";
import type { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { ErrorService } from "../error/error.service.js";
import type { AuthService } from "./auth.service.js";
import {
  changeEmailSchema,
  loginSchema,
  registerSchema,
  resendEmailSchema,
  verifyEmailChangeSchema,
  verifyEmailSchema,
} from "./auth.validators.js";

type GetRequestContext =
  typeof import("../../services/ip-location.service.js").getRequestContext;

type SetAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => void;

type AuthControllerDependencies = {
  authService: AuthService;
  errorService: ErrorService;
  auditEventService: AuditEventService;
  getRequestContext: GetRequestContext;
  setAuthCookies: SetAuthCookies;
  createApiError: (statusCode: number, message: string) => ApiError;
  getErrorStatusCode: (error: unknown) => number;
  getErrorMessage: (error: unknown) => string;
};

const createAuthController = ({
  authService,
  errorService,
  auditEventService,
  getRequestContext,
  setAuthCookies,
  createApiError,
  getErrorStatusCode,
  getErrorMessage,
}: AuthControllerDependencies) => {
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

  const verifyEmailChange = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    if (!req.user?.id || !req.user.sessionId || !req.user.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const body = verifyEmailChangeSchema.shape.body.parse(req.validatedBody);
    const { otp } = body;

    const updatedUser = await authService.verifyEmailChange({
      otp,
      userId: req.user.id,
      sessionId: req.user.sessionId,
      userSessionId: req.user.userSessionId,
      requestMetadata,
    });

    return res.status(200).json({
      message: "Email verified and changed successfully",
      user: updatedUser,
    });
  });

  const resendEmail = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    const body = resendEmailSchema.shape.body.parse(req.validatedBody);
    const { email } = body;

    await authService.resendEmail({ email, requestMetadata });

    return res.status(201).json({ message: "Email sent successfully!" });
  });

  const changeEmail = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);
    if (!req.user?.id || !req.user.sessionId || !req.user.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const body = changeEmailSchema.shape.body.parse(req.validatedBody);

    const { newEmail } = body;
    await authService.sendNewEmailCode({
      userId: req.user.id,
      newEmail,
      requestMetadata,
      sessionId: req.user.sessionId,
      userSessionId: req.user.userSessionId,
    });

    return res.status(201).json({
      message: "OTP sent successfully. Check your new email for the OTP.",
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

  return {
    login,
    register,
    verifyEmailChange,
    verifyEmail,
    resendEmail,
    changeEmail,
  };
};

export { createAuthController };
export type AuthController = ReturnType<typeof createAuthController>;
