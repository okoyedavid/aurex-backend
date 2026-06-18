import jwt from "jsonwebtoken";

import { TokenPayload } from "../types/generic.js";
import { env } from "../config/env.js";

const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || "15m",
  });

const signRefreshToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET || env.JWT_ACCESS_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  });

const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET || env.JWT_ACCESS_SECRET);

export const jsonWebService = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};

export type JsonWebService = typeof jsonWebService;
