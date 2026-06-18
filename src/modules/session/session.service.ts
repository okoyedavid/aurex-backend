import {
  LocationMetadata,
  RequestMetadata,
} from "../../repositories/repository-types.js";
import { UserDocument } from "../users/user.models.js";
import {
  CreateAuthSession,
  CreateLoginSessionAtomically,
  CreateUserSession,
  MintSession,
  SessionServiceDependencies,
} from "./session.types.js";

const defaultRequestMetadata: RequestMetadata = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
  deviceName: null,
};

const defaultLocation: LocationMetadata = {
  country: null,
  region: null,
  city: null,
};

const ROTATED_TOKEN_GRACE_MS = 20 * 1000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const buildExpiresAt = (
  expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS),
) => expiresAt;

const createSessionService = ({
  tokenService,
  authSessionRepository,
  userSessionRepository,
  withTransaction,
  createHttpError,
}: SessionServiceDependencies) => {
  const mintSessionTokens = ({
    userId,
    userSessionId,
    authSessionId,
  }: MintSession) => {
    const accessToken = tokenService.signAccessToken({
      userId,
      userSessionId,
      sessionId: authSessionId,
    });
    const refreshToken = tokenService.signRefreshToken({
      userId,
      userSessionId,
      sessionId: authSessionId,
    });

    return { accessToken, refreshToken };
  };

  const createUserSessionRecord = async ({
    userId,
    userSessionId,
    currentAuthSessionId,
    requestMetadata = defaultRequestMetadata,
    location = defaultLocation,
    expiresAt = buildExpiresAt(),
    mongoSession,
  }: CreateUserSession) => {
    if (!userId || !userSessionId) {
      throw createHttpError("User id and user session id are required", 400);
    }

    return userSessionRepository.createUserSession(
      {
        userId,
        userSessionId,
        currentAuthSessionId,
        userAgent: requestMetadata.userAgent,
        deviceName: requestMetadata.deviceName,
        ipAddress: requestMetadata.ipAddress,
        city: location.city,
        region: location.region,
        country: location.country,
        expiresAt,
      },
      mongoSession ? { session: mongoSession } : {},
    );
  };

  const createAuthSessionRecord = async ({
    userId,
    userSessionId,
    sessionId,
    refreshToken,
    expiresAt = buildExpiresAt(),
    mongoSession,
  }: CreateAuthSession) => {
    if (!userId || !userSessionId || !sessionId || !refreshToken) {
      throw createHttpError(
        "User id, user session id, session id, and refresh token are required",
        400,
      );
    }

    return authSessionRepository.createAuthSession(
      {
        userId,
        userSessionId,
        sessionId,
        refreshTokenHash: tokenService.hashToken(refreshToken),
        expiresAt,
      },
      mongoSession ? { session: mongoSession } : {},
    );
  };

  const createLoginSessionAtomically = async ({
    userId,
    userSessionId,
    authSessionId,
    refreshToken,
    requestMetadata = defaultRequestMetadata,
    location = defaultLocation,
    expiresAt = buildExpiresAt(),
  }: CreateLoginSessionAtomically) =>
    withTransaction(async (mongoSession) => {
      const userSession = await createUserSessionRecord({
        userId,
        userSessionId,
        currentAuthSessionId: authSessionId,
        requestMetadata,
        location,
        expiresAt,
        mongoSession,
      });

      const authSession = await createAuthSessionRecord({
        userId,
        userSessionId,
        sessionId: authSessionId,
        refreshToken,
        expiresAt,
        mongoSession,
      });

      return { userSession, authSession };
    });

  const createLoginSession = async ({
    user,
    requestMetadata = defaultRequestMetadata,
    location = defaultLocation,
  }: {
    user: UserDocument;
    location?: LocationMetadata;
    requestMetadata?: RequestMetadata;
  }) => {
    const userSessionId = crypto.randomUUID();
    const authSessionId = crypto.randomUUID();
    const { accessToken, refreshToken } = mintSessionTokens({
      userId: user.id,
      userSessionId,
      authSessionId,
    });

    const { userSession } = await createLoginSessionAtomically({
      userId: user.id,
      userSessionId,
      authSessionId,
      refreshToken,
      requestMetadata,
      location,
    });

    return { accessToken, refreshToken, userSession };
  };

  return {
    createLoginSession,
    mintSessionTokens,
    createLoginSessionAtomically,
  };
};

export type SessionService = ReturnType<typeof createSessionService>;
export { createSessionService };

// import mongoose from "mongoose";

// import {
//   createUserSession as createUserSessionRecord,
//   findActiveUserSessionById,
//   findUserSessionById,
//   findUserSessionsByUserId,
//   revokeUserSessionsByUserId,
//   updateUserSessionById,
// } from "../repositories/user-session.repository.js";
// import {
//   createAuthSession as createAuthSessionRecord,
//   findAuthSessionById,
//   revokeAuthSessionsByUserSessionId,
//   updateAuthSessionById,
// } from "../repositories/auth-session.repository.js";
// import { hashToken, verifyRefreshToken } from "./token.service.js";

// const touchUserSession = async ({
//   userSessionId,
//   authSessionId = null,
//   expiresAt = buildExpiresAt(),
//   mongoSession = null,
// }) => {
//   if (!userSessionId) {
//     throw createHttpError("User session id is required", 400);
//   }

//   return updateUserSessionById(
//     userSessionId,
//     {
//       currentAuthSessionId: authSessionId,
//       lastSeenAt: new Date(),
//       expiresAt,
//     },
//     mongoSession ? { session: mongoSession } : {},
//   );
// };

// const rotateAuthSession = async ({
//   oldSessionId,
//   newSessionId,
//   userId,
//   userSessionId,
//   refreshToken,
//   expiresAt = buildExpiresAt(),
//   mongoSession = null,
// }) => {
//   if (
//     !oldSessionId ||
//     !newSessionId ||
//     !userId ||
//     !userSessionId ||
//     !refreshToken
//   ) {
//     throw createHttpError(
//       "Old session id, new session id, user id, user session id, and refresh token are required",
//       400,
//     );
//   }

//   const newAuthSession = await createAuthSessionRecord(
//     {
//       userId,
//       userSessionId,
//       sessionId: newSessionId,
//       refreshTokenHash: hashToken(refreshToken),
//       expiresAt,
//     },
//     mongoSession ? { session: mongoSession } : {},
//   );

//   await updateAuthSessionById(
//     oldSessionId,
//     {
//       revokedAt: new Date(),
//       replacedBySessionId: newSessionId,
//       lastSeenAt: new Date(),
//     },
//     mongoSession ? { session: mongoSession } : {},
//   );

//   const userSession = await touchUserSession({
//     userSessionId,
//     authSessionId: newSessionId,
//     expiresAt,
//     mongoSession,
//   });

//   return { authSession: newAuthSession, userSession };
// };

// const rotateAuthSessionAtomically = async ({
//   refreshToken,
//   newRefreshToken,
//   userId,
//   userSessionId,
//   oldSessionId,
//   newSessionId,
//   expiresAt = buildExpiresAt(),
// }) =>
//   withTransaction(async (mongoSession) => {
//     if (
//       !refreshToken ||
//       !newRefreshToken ||
//       !userId ||
//       !userSessionId ||
//       !oldSessionId ||
//       !newSessionId
//     ) {
//       throw createHttpError(
//         "Refresh token, new refresh token, user id, user session id, old session id, and new session id are required",
//         400,
//       );
//     }

//     const payload = verifyRefreshToken(refreshToken);
//     const authSession = await findAuthSessionById(oldSessionId, {
//       session: mongoSession,
//     });

//     if (!authSession) {
//       throw createHttpError("Session not found", 401);
//     }

//     const userSession = await findUserSessionById(userSessionId, {
//       session: mongoSession,
//     });

//     if (!userSession) {
//       throw createHttpError("User session not found", 401);
//     }

//     if (userSession.userId.toString() !== payload.userId) {
//       throw createHttpError("Session user mismatch", 401);
//     }

//     if (authSession.userSessionId !== userSession.userSessionId) {
//       throw createHttpError("Session chain mismatch", 401);
//     }

//     if (userSession.revokedAt || userSession.expiresAt <= new Date()) {
//       throw createHttpError("User session not found or inactive", 401);
//     }

//     if (authSession.revokedAt && authSession.replacedBySessionId) {
//       const revokedAgeMs = Date.now() - authSession.revokedAt.getTime();

//       if (revokedAgeMs < ROTATED_TOKEN_GRACE_MS) {
//         throw createHttpError("Refresh token recently rotated", 409);
//       }

//       await revokeAuthSessionChain(authSession.replacedBySessionId, mongoSession);
//       await revokeUserSession(userSession.userSessionId, mongoSession);
//       throw createHttpError("Refresh token reuse detected", 401);
//     }

//     if (authSession.revokedAt || authSession.expiresAt <= new Date()) {
//       throw createHttpError("Session not found or inactive", 401);
//     }

//     if (authSession.refreshTokenHash !== hashToken(refreshToken)) {
//       await revokeAuthSessionChain(oldSessionId, mongoSession);
//       await revokeUserSession(userSession.userSessionId, mongoSession);
//       throw createHttpError("Refresh token mismatch", 401);
//     }

//     const newAuthSession = await createAuthSessionRecord(
//       {
//         userId,
//         userSessionId,
//         sessionId: newSessionId,
//         refreshTokenHash: hashToken(newRefreshToken),
//         expiresAt,
//       },
//       { session: mongoSession },
//     );

//     await updateAuthSessionById(
//       oldSessionId,
//       {
//         revokedAt: new Date(),
//         replacedBySessionId: newSessionId,
//         lastSeenAt: new Date(),
//       },
//       { session: mongoSession },
//     );

//     const updatedUserSession = await touchUserSession({
//       userSessionId,
//       authSessionId: newSessionId,
//       expiresAt,
//       mongoSession,
//     });

//     return {
//       payload,
//       authSession: newAuthSession,
//       userSession: updatedUserSession,
//     };
//   });

// const revokeAuthSessionChain = async (sessionId, mongoSession = null) => {
//   let currentSessionId = sessionId;

//   while (currentSessionId) {
//     const authSession = await findAuthSessionById(
//       currentSessionId,
//       mongoSession ? { session: mongoSession } : {},
//     );

//     if (!authSession) {
//       break;
//     }

//     if (!authSession.revokedAt) {
//       await updateAuthSessionById(
//         currentSessionId,
//         {
//           revokedAt: new Date(),
//         },
//         mongoSession ? { session: mongoSession } : {},
//       );
//     }

//     currentSessionId = authSession.replacedBySessionId;
//   }
// };

// const revokeUserSession = async (userSessionId, mongoSession = null) => {
//   if (!userSessionId) {
//     throw createHttpError("User session id is required", 400);
//   }

//   const userSession = await updateUserSessionById(
//     userSessionId,
//     {
//       revokedAt: new Date(),
//       currentAuthSessionId: null,
//     },
//     mongoSession ? { session: mongoSession } : {},
//   );

//   await revokeAuthSessionsByUserSessionId(
//     userSessionId,
//     mongoSession ? { session: mongoSession } : {},
//   );

//   return userSession;
// };

// const revokeOtherUserSessions = async ({
//   userId,
//   currentUserSessionId,
//   mongoSession = null,
// }) => {
//   if (!userId || !currentUserSessionId) {
//     throw createHttpError(
//       "User id and current user session id are required",
//       400,
//     );
//   }

//   const sessions = await findUserSessionsByUserId(
//     userId,
//     mongoSession ? { session: mongoSession } : {},
//   );
//   const sessionsToRevoke = sessions.filter(
//     (session) =>
//       session.userSessionId !== currentUserSessionId && session.revokedAt === null,
//   );

//   await revokeUserSessionsByUserId(
//     userId,
//     currentUserSessionId,
//     mongoSession ? { session: mongoSession } : {},
//   );

//   for (const session of sessionsToRevoke) {
//     await revokeAuthSessionsByUserSessionId(
//       session.userSessionId,
//       mongoSession ? { session: mongoSession } : {},
//     );
//   }

//   return {
//     revokedCount: sessionsToRevoke.length,
//   };
// };

// const validateAuthSession = async (refreshToken) => {
//   if (!refreshToken) {
//     throw createHttpError("Refresh token is required", 401);
//   }

//   const payload = verifyRefreshToken(refreshToken);
//   const authSession = await findAuthSessionById(payload.sessionId);

//   if (!authSession) {
//     throw createHttpError("Session not found", 401);
//   }

//   const userSessionId = payload.userSessionId ?? authSession.userSessionId;
//   const userSession = await findUserSessionById(userSessionId);

//   if (!userSession) {
//     throw createHttpError("User session not found", 401);
//   }

//   if (userSession.userId.toString() !== payload.userId) {
//     throw createHttpError("Session user mismatch", 401);
//   }

//   if (authSession.userSessionId !== userSession.userSessionId) {
//     throw createHttpError("Session chain mismatch", 401);
//   }

//   if (userSession.revokedAt || userSession.expiresAt <= new Date()) {
//     throw createHttpError("User session not found or inactive", 401);
//   }

//   if (authSession.revokedAt && authSession.replacedBySessionId) {
//     const revokedAgeMs = Date.now() - authSession.revokedAt.getTime();

//     if (revokedAgeMs < ROTATED_TOKEN_GRACE_MS) {
//       throw createHttpError("Refresh token recently rotated", 409);
//     }

//     await revokeAuthSessionChain(authSession.replacedBySessionId);
//     await revokeUserSession(userSession.userSessionId);
//     throw createHttpError("Refresh token reuse detected", 401);
//   }

//   if (authSession.revokedAt || authSession.expiresAt <= new Date()) {
//     throw createHttpError("Session not found or inactive", 401);
//   }

//   if (authSession.refreshTokenHash !== hashToken(refreshToken)) {
//     await revokeAuthSessionChain(payload.sessionId);
//     await revokeUserSession(userSession.userSessionId);
//     throw createHttpError("Refresh token mismatch", 401);
//   }

//   return { payload, authSession, userSession };
// };

// const getUserSessionIdFromAuthSessionId = async (sessionId) => {
//   if (!sessionId) {
//     throw createHttpError("Session id is required", 400);
//   }

//   const authSession = await findAuthSessionById(sessionId);

//   if (!authSession) {
//     throw createHttpError("Session not found", 404);
//   }

//   return authSession.userSessionId;
// };

// const getUserSessionById = async (userSessionId) => {
//   if (!userSessionId) {
//     throw createHttpError("User session id is required", 400);
//   }

//   return findUserSessionById(userSessionId);
// };

// const getActiveUserSessionById = async (userSessionId) => {
//   if (!userSessionId) {
//     throw createHttpError("User session id is required", 400);
//   }

//   return findActiveUserSessionById(userSessionId);
// };

// const getUserSessions = async (userId) => {
//   if (!userId) {
//     throw createHttpError("User id is required", 400);
//   }

//   return findUserSessionsByUserId(userId);
// };

// export {
//   createAuthSession,
//   createLoginSessionAtomically,
//   createUserSession,
//   getUserSessionIdFromAuthSessionId,
//   getActiveUserSessionById,
//   getUserSessionById,
//   getUserSessions,
//   revokeAuthSessionChain,
//   revokeOtherUserSessions,
//   revokeUserSession,
//   rotateAuthSession,
//   rotateAuthSessionAtomically,
//   touchUserSession,
//   validateAuthSession,
// };
