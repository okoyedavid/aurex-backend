import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type { HttpError } from "../../utils/api-error.js";

type GoogleOAuthDependencies = {
  createHttpError: (message: string, statusCode: number) => HttpError;
  fetchImpl?: typeof fetch;
  configuration?: Partial<GoogleOAuthConfiguration>;
};

export type GoogleOAuthConfiguration = {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
};

export type GoogleProfile = {
  subject: string;
  email: string;
  name: string | null;
  picture: string | null;
};

const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleTokenInfoEndpoint = "https://oauth2.googleapis.com/tokeninfo";

const requireConfiguration = (createHttpError: GoogleOAuthDependencies["createHttpError"], overrides: Partial<GoogleOAuthConfiguration> = {}) => {
  const configuration = {
    clientId: overrides.clientId ?? env.GOOGLE_CLIENT_ID,
    clientSecret: overrides.clientSecret ?? env.GOOGLE_CLIENT_SECRET,
    redirectUrl: overrides.redirectUrl ?? env.GOOGLE_REDIRECT_URL,
  };
  if (!configuration.clientId || !configuration.clientSecret || !configuration.redirectUrl) {
    throw createHttpError("Google login is not configured", 503);
  }

  return {
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    redirectUrl: configuration.redirectUrl,
  };
};

const randomState = () => crypto.randomBytes(32).toString("base64url");

export const createGoogleOAuthService = ({
  createHttpError,
  fetchImpl = fetch,
  configuration: configurationOverrides,
}: GoogleOAuthDependencies) => {
  const createState = randomState;

  const getAuthorizationUrl = (state: string) => {
    const configuration = requireConfiguration(createHttpError, configurationOverrides);
    const url = new URL(googleAuthorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: configuration.clientId,
      redirect_uri: configuration.redirectUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce: state,
      access_type: "online",
      prompt: "select_account",
    }).toString();
    return url.toString();
  };

  const authenticateCode = async (code: string, expectedNonce: string): Promise<GoogleProfile> => {
    const configuration = requireConfiguration(createHttpError, configurationOverrides);
    let tokenResponse: Response;
    try {
      tokenResponse = await fetchImpl(googleTokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          redirect_uri: configuration.redirectUrl,
          grant_type: "authorization_code",
        }),
      });
    } catch {
      throw createHttpError("Google token exchange is unavailable", 502);
    }

    if (!tokenResponse.ok) throw createHttpError("Google token exchange failed", 401);
    const tokenPayload = await tokenResponse.json() as { id_token?: string };
    if (!tokenPayload.id_token) throw createHttpError("Google token exchange returned no ID token", 401);

    let identityResponse: Response;
    try {
      identityResponse = await fetchImpl(`${googleTokenInfoEndpoint}?id_token=${encodeURIComponent(tokenPayload.id_token)}`);
    } catch {
      throw createHttpError("Google identity verification is unavailable", 502);
    }

    if (!identityResponse.ok) throw createHttpError("Invalid Google identity token", 401);
    const payload = await identityResponse.json() as Record<string, unknown>;
    const issuer = payload.iss;
    const audience = payload.aud;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const subject = typeof payload.sub === "string" ? payload.sub : "";

    if (
      !subject ||
      !email ||
      (payload.email_verified !== true && payload.email_verified !== "true") ||
      (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") ||
      audience !== configuration.clientId ||
      payload.nonce !== expectedNonce
    ) {
      throw createHttpError("Google identity verification failed", 401);
    }

    const picture = typeof payload.picture === "string" && payload.picture.startsWith("https://")
      ? payload.picture
      : null;

    return {
      subject,
      email,
      name: typeof payload.name === "string" ? payload.name.trim() || null : null,
      picture,
    };
  };

  return { createState, getAuthorizationUrl, authenticateCode };
};

export type GoogleOAuthService = ReturnType<typeof createGoogleOAuthService>;
