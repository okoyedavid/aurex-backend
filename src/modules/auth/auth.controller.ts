import type { Response } from "express";
import type { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { ErrorService } from "../error/error.service.js";
import type { AuthService } from "./auth.service.js";
import { loginSchema } from "./auth.validators.js";

type GetRequestContext = typeof import("../../services/ip-location.service.js").getRequestContext;

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

  return { login };
};

export { createAuthController };
export type AuthController = ReturnType<typeof createAuthController>;
