import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "./auth.service.js";

const requestMetadata = { requestId: "request-1", ipAddress: null, userAgent: "test", deviceName: null };
const location = { country: null, region: null, city: null };
const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

const document = (value: Record<string, unknown>) => ({
  ...value,
  id: value.id,
  status: value.status ?? "active",
  emailVerifiedAt: value.emailVerifiedAt ?? null,
  toObject: () => ({ ...value }),
});

const setup = (existing: Record<string, unknown> | null = null) => {
  const user = existing ? document(existing) : null;
  const created = document({ id: "user-new", email: "new@example.com", name: "New User", googleId: "google-1", avatar: "https://avatar" });
  const repository = {
    findUserByGoogleId: vi.fn(async () => user),
    findUserByEmail: vi.fn(async () => user),
    createUser: vi.fn(async () => created),
    updateUserById: vi.fn(async () => user),
  };
  const sessionService = { createLoginSession: vi.fn(async () => ({ accessToken: "access", refreshToken: "refresh", userSession: { userSessionId: "us-1", currentAuthSessionId: "as-1" } })) };
  const service = createAuthService({
    userRepository: repository as never,
    sessionService: sessionService as never,
    hashService: {} as never,
    verificationService: {} as never,
    auditEventService: {} as never,
    withTransaction: vi.fn() as never,
    createHttpError,
    googleOAuthService: { authenticateCode: vi.fn(async () => ({ subject: "google-1", email: "new@example.com", name: "New User", picture: "https://avatar" })) } as never,
  });
  return { service, repository, sessionService, created };
};

describe("Google authentication", () => {
  it("creates a verified Google user with the profile image and creates the normal Aurex session", async () => {
    const fixture = setup();
    const result = await fixture.service.loginWithGoogle({ code: "code", nonce: "state", requestMetadata, location });
    expect(fixture.repository.createUser).toHaveBeenCalledWith(expect.objectContaining({ googleId: "google-1", emailVerifiedAt: expect.any(Date), avatar: "https://avatar" }));
    expect(fixture.sessionService.createLoginSession).toHaveBeenCalledWith(expect.objectContaining({ user: fixture.created, requestMetadata, location }));
    expect(result).toMatchObject({ accessToken: "access", refreshToken: "refresh", user: expect.objectContaining({ id: "user-new" }) });
  });

  it("links an existing verified-email account and refreshes its Google avatar", async () => {
    const existing = { id: "user-existing", email: "new@example.com", name: "Existing", password: "hash", googleId: null, avatar: null, emailVerifiedAt: null };
    const fixture = setup(existing);
    await fixture.service.loginWithGoogle({ code: "code", nonce: "state", requestMetadata, location });
    expect(fixture.repository.updateUserById).toHaveBeenCalledWith("user-existing", expect.objectContaining({ googleId: "google-1", avatar: "https://avatar", emailVerifiedAt: expect.any(Date) }));
  });
});
