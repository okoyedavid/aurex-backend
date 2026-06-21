import jwt from "jsonwebtoken";

import { TokenPayload } from "../types/generic.js";
import { env } from "../config/env.js";
import { createHttpError } from "./api-error.js";

type AuthTokenPayload = {
  userId: string;
  userSessionId: string;
  sessionId: string;
};

const isAuthTokenPayload = (payload: unknown): payload is AuthTokenPayload => {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "userId" in payload &&
    typeof payload.userId === "string" &&
    "userSessionId" in payload &&
    typeof payload.userSessionId === "string" &&
    "sessionId" in payload &&
    typeof payload.sessionId === "string"
  );
};

const signRefreshToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET || env.JWT_ACCESS_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });

const verifyRefreshToken = (token: string): AuthTokenPayload => {
  const payload = jwt.verify(
    token,
    env.JWT_REFRESH_SECRET || env.JWT_ACCESS_SECRET,
  );

  if (!isAuthTokenPayload(payload)) {
    throw createHttpError("Invalid refresh token payload", 401);
  }

  return payload;
};

const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || "15m",
  });

const verifyAccessToken = (token: string): AuthTokenPayload => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (!isAuthTokenPayload(payload)) {
    throw createHttpError("Invalid refresh token payload", 401);
  }

  return payload;
};

export const jsonWebService = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};

export type JsonWebService = typeof jsonWebService;
