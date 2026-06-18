import { CookieOptions, Response } from "express";

const isProduction = process.env.NODE_ENV === "production";

// const productionDomain = isProduction ? ".animex.okoyedavid.com" : undefined;
// const getAuthCookieSameSite = () => (isProduction ? "none" : "lax");

const getAccessTokenCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  //   domain: productionDomain,
  path: "/",
  maxAge: 15 * 60 * 1000,
});

const getRefreshTokenCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  //   domain: productionDomain,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const getOAuthStateCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
  maxAge: 10 * 60 * 1000,
});

const setAuthCookies = (
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string },
) => {
  res.cookie("accessToken", accessToken, getAccessTokenCookieOptions());
  res.cookie("refreshToken", refreshToken, getRefreshTokenCookieOptions());
};

const clearAuthCookies = (res: Response) => {
  const { maxAge: _accessMaxAge, ...accessTokenOptions } =
    getAccessTokenCookieOptions();
  const { maxAge: _refreshMaxAge, ...refreshTokenOptions } =
    getRefreshTokenCookieOptions();

  res.clearCookie("accessToken", accessTokenOptions);
  res.clearCookie("refreshToken", refreshTokenOptions);
};

const setOAuthStateCookie = (res: Response, provider: string, state: string) => {
  res.cookie(`${provider}OAuthState`, state, getOAuthStateCookieOptions());
};

const clearOAuthStateCookie = (res: Response, provider: string) => {
  const { maxAge: _maxAge, ...options } = getOAuthStateCookieOptions();

  res.clearCookie(`${provider}OAuthState`, options);
};

export {
  clearAuthCookies,
  clearOAuthStateCookie,
  getAccessTokenCookieOptions,
  getOAuthStateCookieOptions,
  getRefreshTokenCookieOptions,
  setOAuthStateCookie,
  setAuthCookies,
};
