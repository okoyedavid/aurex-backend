import dotenv from "dotenv";
import { z } from "zod";

import type { SignOptions } from "jsonwebtoken";

type JwtExpiresIn = NonNullable<SignOptions["expiresIn"]>;

const jwtExpiresInSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d|w|y)$/, "JWT expiry must look like 15m, 7d, 1h, 30s")
  .transform((value) => value as JwtExpiresIn);

const nodeEnv = process.env.NODE_ENV ?? "development";

dotenv.config({
  path: nodeEnv === "test" ? ".env.test" : ".env",
});

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(5000),

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET is too short"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET is too short"),

  JWT_EXPIRES_IN: jwtExpiresInSchema.default("15m" as JwtExpiresIn),
  REFRESH_TOKEN_EXPIRES_IN: jwtExpiresInSchema.default("7d" as JwtExpiresIn),

  CLIENT_URL: z.string().url("CLIENT_URL must be a valid URL"),
  RELEASE: z.string().min(1, "MONGO_URI is required"),
  MAXMIND_DB_PATH: z.string().min(1, "MAXMIND_DB_PATH is required"),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  APP_NAME: z.string().min(1).default("Aurex"),
});

export const env = envSchema.parse(process.env);
