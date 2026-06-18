import crypto from "crypto";
import { TokenPayload } from "../../types/generic.js";
import { JsonWebService } from "../../utils/jwt.js";

// const createOtpToken = () => {
//   const token = crypto.randomInt(100000, 1000000).toString();

//   return {
//     token,
//     tokenHash: hashToken(token),
//   };
// };

// const createHttpError = (message, statusCode) =>
//   Object.assign(new Error(message), { statusCode });

// const verifyGoogleIdToken = async (idToken) => {
//   if (!idToken) {
//     throw createHttpError("Google ID token is required", 400);
//   }

//   if (!env.googleClientId) {
//     throw createHttpError("Google client id is not configured", 500);
//   }

//   let response;

//   try {
//     response = await fetch(
//       `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
//         idToken,
//       )}`,
//     );
//   } catch (_error) {
//     throw createHttpError("Failed to verify Google ID token", 502);
//   }

//   if (!response.ok) {
//     throw createHttpError("Invalid Google ID token", 401);
//   }

//   const payload = await response.json();

//   if (payload.aud !== env.googleClientId) {
//     throw createHttpError("Google ID token audience mismatch", 401);
//   }

//   if (
//     payload.iss !== "accounts.google.com" &&
//     payload.iss !== "https://accounts.google.com"
//   ) {
//     throw createHttpError("Google ID token issuer mismatch", 401);
//   }

//   return {
//     provider: "google",
//     providerUserId: payload.sub,
//     email: payload.email,
//     emailVerified:
//       payload.email_verified === true || payload.email_verified === "true",
//     name: payload.name,
//     picture: payload.picture,
//   };
// };

// const exchangeGoogleCode = async (code) => {
//   if (!code) {
//     throw createHttpError("Google authorization code is required", 400);
//   }

//   if (
//     !env.googleClientId ||
//     !env.googleClientSecret ||
//     !env.googleCallbackUrl
//   ) {
//     throw createHttpError("Google OAuth is not configured", 500);
//   }

//   let response;

//   try {
//     response = await fetch("https://oauth2.googleapis.com/token", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: new URLSearchParams({
//         code,
//         client_id: env.googleClientId,
//         client_secret: env.googleClientSecret,
//         redirect_uri: env.googleCallbackUrl,
//         grant_type: "authorization_code",
//       }),
//     });
//   } catch (_error) {
//     throw createHttpError("Failed to exchange Google authorization code", 502);
//   }

//   if (!response.ok) {
//     throw createHttpError("Google token exchange failed", 502);
//   }

//   const payload = await response.json();

//   if (!payload.id_token) {
//     throw createHttpError("Google token exchange failed", 401);
//   }

//   return payload;
// };

// const exchangeGitHubCode = async (code) => {
//   if (!code) {
//     throw createHttpError("GitHub authorization code is required", 400);
//   }

//   if (
//     !env.githubClientId ||
//     !env.githubClientSecret ||
//     !env.githubCallbackUrl
//   ) {
//     throw createHttpError("GitHub OAuth is not configured", 500);
//   }

//   let response;

//   try {
//     response = await fetch("https://github.com/login/oauth/access_token", {
//       method: "POST",
//       headers: {
//         Accept: "application/json",
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: new URLSearchParams({
//         client_id: env.githubClientId,
//         client_secret: env.githubClientSecret,
//         code,
//         redirect_uri: env.githubCallbackUrl,
//       }),
//     });
//   } catch (_error) {
//     throw createHttpError("Failed to exchange GitHub authorization code", 502);
//   }

//   if (!response.ok) {
//     throw createHttpError("GitHub token exchange failed", 502);
//   }

//   const payload = await response.json();

//   if (payload.error || !payload.access_token) {
//     throw createHttpError("GitHub token exchange failed", 401);
//   }

//   return payload.access_token;
// };

// const fetchGitHubUser = async (accessToken) => {
//   if (!accessToken) {
//     throw createHttpError("GitHub access token is required", 400);
//   }

//   const headers = {
//     Accept: "application/vnd.github+json",
//     Authorization: `Bearer ${accessToken}`,
//     "User-Agent": env.appName,
//     "X-GitHub-Api-Version": "2022-11-28",
//   };

//   let userResponse;

//   try {
//     userResponse = await fetch("https://api.github.com/user", {
//       headers,
//     });
//   } catch (_error) {
//     throw createHttpError("Failed to fetch GitHub user profile", 502);
//   }

//   if (!userResponse.ok) {
//     throw createHttpError("Failed to fetch GitHub user profile", 401);
//   }

//   const profile = await userResponse.json();

//   let emailAddresses = [];

//   try {
//     const emailsResponse = await fetch("https://api.github.com/user/emails", {
//       headers,
//     });

//     if (emailsResponse.ok) {
//       emailAddresses = await emailsResponse.json();
//     }
//   } catch (_error) {
//     emailAddresses = [];
//   }

//   const primaryVerifiedEmail = emailAddresses.find(
//     (emailEntry) => emailEntry.primary && emailEntry.verified,
//   );
//   const firstVerifiedEmail = emailAddresses.find(
//     (emailEntry) => emailEntry.verified,
//   );
//   const email =
//     primaryVerifiedEmail?.email ?? firstVerifiedEmail?.email ?? profile.email;
//   const emailVerified = emailAddresses.length
//     ? emailAddresses.some(
//         (emailEntry) => emailEntry.email === email && emailEntry.verified,
//       )
//     : Boolean(profile.email);

//   return {
//     provider: "github",
//     providerUserId: profile.id?.toString(),
//     email,
//     emailVerified,
//     name: profile.name || profile.login,
//     username: profile.login,
//     picture: profile.avatar_url,
//   };
// };

// export {
//   createOtpToken,
//   exchangeGoogleCode,
//   exchangeGitHubCode,
//   fetchGitHubUser,
//   hashToken,
//   signAccessToken,
//   signRefreshToken,
//   verifyAccessToken,
//   verifyGoogleIdToken,
//   verifyRefreshToken,
// };

type TokenServiceDependencies = { jsonWebService: JsonWebService };

export const createTokenService = ({
  jsonWebService,
}: TokenServiceDependencies) => {
  const signAccessToken = (payload: TokenPayload) =>
    jsonWebService.signAccessToken(payload);

  const signRefreshToken = (payload: TokenPayload) =>
    jsonWebService.signRefreshToken(payload);

  const verifyAccessJwt = (token: string) =>
    jsonWebService.verifyAccessToken(token);

  const verifyRefreshJwt = (token: string) =>
    jsonWebService.verifyRefreshToken(token);

  const hashToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");

  return {
    signAccessToken,
    signRefreshToken,
    verifyAccessJwt,
    verifyRefreshJwt,
    hashToken,
  };
};

export type TokenService = ReturnType<typeof createTokenService>;
