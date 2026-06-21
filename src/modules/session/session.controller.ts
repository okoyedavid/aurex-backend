import type { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

import type { Response } from "express";
import { UserSessionDocument } from "../user-session/user-session.model.js";
import { SessionService } from "./session.service.js";
import { revokeSessionSchema } from "./session.validators.js";

type GetRequestContext =
  typeof import("../../services/ip-location.service.js").getRequestContext;

type SessionControllerDependencies = {
  getRequestContext: GetRequestContext;
  clearAuthCookies: (res: Response) => void;
  createApiError: (statusCode: number, message: string) => ApiError;
  sessionService: SessionService;
};

const createSessionController = ({
  getRequestContext,
  clearAuthCookies,
  createApiError,
  sessionService,
}: SessionControllerDependencies) => {
  const getMySessions = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    if (!req.user?.id || !req.user.sessionId || !req.user.userSessionId) {
      throw createApiError(401, "Authentication required");
    }
    const sessions = await sessionService.getUserSessions(req.user.id);
    const currentSessionId = req.user.userSessionId ?? null;
    const currentIpAddress = requestMetadata.ipAddress;

    const formattedSessions = sessions.map((session: UserSessionDocument) => ({
      id: session.userSessionId,
      userId: session.userId,
      userSessionId: session.userSessionId,
      currentAuthSessionId: session.currentAuthSessionId,
      userAgent: session.userAgent,
      deviceName: session.deviceName,
      ipAddress: session.ipAddress,
      city: session.city,
      region: session.region,
      country: session.country,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      isCurrentSession: session.userSessionId === currentSessionId,
      isCurrentIpMatch: currentIpAddress
        ? session.ipAddress === currentIpAddress
        : false,
    }));

    return res.status(200).json({
      currentIpAddress,
      message: "session retrieved successfully",
      data: formattedSessions,
      sessions: formattedSessions,
    });
  });

  const revokeSession = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    if (!req.user?.id || !req.user.sessionId || !req.user.userSessionId) {
      throw createApiError(401, "Authentication required");
    }
    const body = revokeSessionSchema.shape.params.parse(req.validatedParams);
    const { userSessionId } = body;
    const revokedCurrentSession = userSessionId === req.user.userSessionId;
    const session = await sessionService.getUserSessionById(userSessionId);

    if (!session || session.userId.toString() !== req.user.id) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    const { revokedSession } = await sessionService.revokeSession({
      requestMetadata,
      userId: req.user.id,
      sessionId: req.user.sessionId,
      userSessionId,
    });

    if (revokedCurrentSession) {
      clearAuthCookies(res);
    }

    return res.status(200).json({
      message: "Session revoked successfully",
      revokedCurrentSession,
      userSession: revokedSession,
    });
  });

  const revokeOtherSessions = asyncHandler(async (req, res) => {
    const { requestMetadata } = await getRequestContext(req);

    if (!req.user?.id || !req.user.sessionId || !req.user.userSessionId) {
      throw createApiError(401, "Authentication required");
    }

    const { id, sessionId, userSessionId } = req.user;
    const result = await sessionService.revokeOtherUserSessions({
      userId: id,
      currentUserSessionId: userSessionId,
      sessionId,
      requestMetadata,
      method: req.method,
      path: req.path,
    });

    return res.status(200).json({
      message: "Other sessions revoked successfully",
      ...result,
    });
  });

  return {
    getMySessions,
    revokeOtherSessions,
    revokeSession,
  };
};

export { createSessionController };

export type SessionController = ReturnType<typeof createSessionController>;
