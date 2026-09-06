import { describe, expect, it, vi } from "vitest";
import { createGoogleOAuthService } from "./google-oauth.service.js";

const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

describe("Google OAuth service", () => {
  it("creates a Google authorization URL with state and nonce", () => {
    const service = createGoogleOAuthService({ createHttpError, configuration: { clientId: "client-id", clientSecret: "client-secret", redirectUrl: "http://localhost:5000/api/auth/google/callback" } });
    const state = service.createState();
    const url = new URL(service.getAuthorizationUrl(state));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("nonce")).toBe(state);
    expect(url.searchParams.get("redirect_uri")).toContain("/api/auth/google/callback");
  });

  it("exchanges the code and verifies the Google identity claims", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "id-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        iss: "https://accounts.google.com",
        aud: "client-id",
        sub: "google-sub-1",
        email: "User@Example.com",
        email_verified: true,
        name: "Google User",
        picture: "https://lh3.googleusercontent.com/avatar",
        nonce: "state-1",
      }), { status: 200 }));
    const service = createGoogleOAuthService({ createHttpError, fetchImpl, configuration: { clientId: "client-id", clientSecret: "client-secret", redirectUrl: "http://localhost:5000/api/auth/google/callback" } });
    await expect(service.authenticateCode("one-time-code", "state-1")).resolves.toEqual({
      subject: "google-sub-1",
      email: "user@example.com",
      name: "Google User",
      picture: "https://lh3.googleusercontent.com/avatar",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a token with the wrong nonce", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "id-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        iss: "https://accounts.google.com",
        aud: "client-id",
        sub: "google-sub-1",
        email: "user@example.com",
        email_verified: true,
        nonce: "different-state",
      }), { status: 200 }));
    const service = createGoogleOAuthService({ createHttpError, fetchImpl, configuration: { clientId: "client-id", clientSecret: "client-secret", redirectUrl: "http://localhost:5000/api/auth/google/callback" } });
    await expect(service.authenticateCode("one-time-code", "state-1")).rejects.toMatchObject({ statusCode: 401 });
  });
});
