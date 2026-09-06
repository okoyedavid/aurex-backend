import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GitHubApiError } from "./github-client.js";
import { createGitHubConnectionService } from "./github-connection.service.js";

const businessId = "68b000000000000000000001";
const otherBusinessId = "68b000000000000000000004";
const employeeId = "68b000000000000000000002";
const userId = "68b000000000000000000003";
const userSessionId = "1bb75529-d6dc-4742-a9e7-c72e6ba98f33";
const httpError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode });

const installation = {
  id: 42,
  account: { id: 9, login: "acme", type: "Organization" as const },
  repository_selection: "selected" as const,
  suspended_at: null,
};

const setup = () => {
  const repository = {
    findConnection: vi.fn(),
    findConnectionByInstallation: vi.fn(),
    createInstallationAttempt: vi.fn(),
    claimInstallationAttempt: vi.fn(),
    findInstallationAttempt: vi.fn(),
    releaseInstallationAttempt: vi.fn(),
    consumeInstallationAttempt: vi.fn(),
    activateConnection: vi.fn(),
    disconnectConnection: vi.fn(),
    findIdentity: vi.fn(),
    upsertIdentity: vi.fn(),
    deleteIdentity: vi.fn(),
    markBusinessGrantsNeedsConfiguration: vi.fn(),
  };
  const appClient = { getInstallation: vi.fn() };
  const userClient = {
    getAuthenticatedUser: vi.fn(),
    listInstallations: vi.fn(),
  };
  const installationClient = {
    listRepositories: vi.fn(),
    listTeams: vi.fn(),
    getUser: vi.fn(),
  };
  const clientFactory = {
    isConfigured: vi.fn().mockReturnValue(true),
    installUrl: vi.fn(
      (state: string) => `https://github.test/install?state=${state}`,
    ),
    exchangeOAuthCode: vi.fn(),
    forUser: vi.fn(() => userClient),
    forApp: vi.fn(() => appClient),
    forInstallation: vi.fn(() => installationClient),
  };
  const employeeRepository = { findByIdAndBusiness: vi.fn() };
  const auditService = { recordEventSafely: vi.fn() };
  const businessMemberRepository = {
    findActiveMembershipByBusinessAndUser: vi
      .fn()
      .mockResolvedValue({ id: "member" }),
  };
  const enqueue = vi.fn();
  const enqueueBusiness = vi.fn();
  const service = createGitHubConnectionService({
    repository: repository as never,
    employeeRepository: employeeRepository as never,
    businessMemberRepository: businessMemberRepository as never,
    clientFactory: clientFactory as never,
    auditService: auditService as never,
    createHttpError: httpError as never,
    enqueueEmployeeExternalReconciliation: enqueue,
    enqueueBusinessReconciliation: enqueueBusiness,
  });
  const pendingAttempt = {
    _id: "attempt-id",
    businessId,
    initiatedByUserId: userId,
    expiresAt: new Date(Date.now() + 60_000),
    status: "processing",
  };
  const prepareSuccessfulCallback = () => {
    repository.claimInstallationAttempt.mockResolvedValue(pendingAttempt);
    repository.findConnectionByInstallation.mockResolvedValue(null);
    repository.consumeInstallationAttempt.mockResolvedValue({
      ...pendingAttempt,
      status: "consumed",
    });
    repository.activateConnection.mockResolvedValue({
      businessId,
      installationId: 42,
      status: "active",
    });
    clientFactory.exchangeOAuthCode.mockResolvedValue("temporary-token");
    userClient.getAuthenticatedUser.mockResolvedValue({ id: 7, login: "admin" });
    userClient.listInstallations.mockResolvedValue([installation]);
    appClient.getInstallation.mockResolvedValue(installation);
  };
  return {
    service,
    repository,
    appClient,
    userClient,
    clientFactory,
    installationClient,
    employeeRepository,
    auditService,
    enqueue,
    enqueueBusiness,
    pendingAttempt,
    prepareSuccessfulCallback,
  };
};

describe("GitHubConnectionService installation flow", () => {
  it("creates an opaque 256-bit state bound to business, user, and session", async () => {
    const fixture = setup();
    const result = await fixture.service.createInstallUrl(
      businessId,
      userId,
      userSessionId,
      "auth-session",
    );
    const state = new URL(result.url).searchParams.get("state")!;

    expect(Buffer.from(state, "base64url")).toHaveLength(32);
    expect(fixture.repository.createInstallationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        stateHash: crypto.createHash("sha256").update(state).digest("hex"),
        businessId,
        initiatedByUserId: userId,
        initiatedByUserSessionId: userSessionId,
        initiatedByAuthSessionId: "auth-session",
        expiresAt: expect.any(Date),
      }),
    );
    expect(
      fixture.repository.createInstallationAttempt.mock.calls[0][0],
    ).not.toHaveProperty("state");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
  });

  it("creates independent attempts for parallel businesses", async () => {
    const fixture = setup();
    const [first, second] = await Promise.all([
      fixture.service.createInstallUrl(businessId, userId, userSessionId),
      fixture.service.createInstallUrl(otherBusinessId, userId, userSessionId),
    ]);
    expect(first.url).not.toBe(second.url);
    expect(fixture.repository.createInstallationAttempt).toHaveBeenCalledTimes(2);
  });

  it("verifies OAuth access and App metadata before persisting once", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();

    await expect(
      fixture.service.completeOAuthCallback("code", "state", 42),
    ).resolves.toMatchObject({ businessId });

    expect(fixture.clientFactory.exchangeOAuthCode).toHaveBeenCalledWith("code");
    expect(fixture.repository.activateConnection).toHaveBeenCalledWith(
      businessId,
      expect.not.objectContaining({ token: expect.anything() }),
    );
    expect(fixture.auditService.recordEventSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        metadata: expect.objectContaining({
          authorizedGitHubUserId: 7,
          authorizedGitHubLogin: "admin",
        }),
      }),
    );
    expect(fixture.enqueueBusiness).toHaveBeenCalledTimes(1);
    expect(fixture.repository.consumeInstallationAttempt).toHaveBeenCalledTimes(1);
  });

  it("selects the only accessible installation without a candidate ID", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();
    await expect(
      fixture.service.completeOAuthCallback("code", "state"),
    ).resolves.toMatchObject({ businessId });
  });

  it("rejects unknown, expired, and replayed states", async () => {
    const unknown = setup();
    unknown.repository.claimInstallationAttempt.mockResolvedValue(null);
    unknown.repository.findInstallationAttempt.mockResolvedValue(null);
    await expect(
      unknown.service.completeOAuthCallback("code", "unknown-state"),
    ).rejects.toMatchObject({ reason: "invalid_state" });

    const expired = setup();
    expired.repository.claimInstallationAttempt.mockResolvedValue(null);
    expired.repository.findInstallationAttempt.mockResolvedValue({
      businessId,
      expiresAt: new Date(Date.now() - 1),
      status: "pending",
    });
    await expect(
      expired.service.completeOAuthCallback("code", "expired-state"),
    ).rejects.toMatchObject({ reason: "expired_state" });

    const replayed = setup();
    replayed.repository.claimInstallationAttempt.mockResolvedValue(null);
    replayed.repository.findInstallationAttempt.mockResolvedValue({
      businessId,
      expiresAt: new Date(Date.now() + 60_000),
      status: "consumed",
    });
    await expect(
      replayed.service.completeOAuthCallback("code", "replayed-state"),
    ).rejects.toMatchObject({ reason: "invalid_state" });
  });

  it("allows only the atomic claim winner to process concurrent callbacks", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();
    fixture.repository.claimInstallationAttempt
      .mockResolvedValueOnce(fixture.pendingAttempt)
      .mockResolvedValueOnce(null);
    fixture.repository.findInstallationAttempt.mockResolvedValue({
      ...fixture.pendingAttempt,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const results = await Promise.allSettled([
      fixture.service.completeOAuthCallback("code", "same-state", 42),
      fixture.service.completeOAuthCallback("code", "same-state", 42),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(fixture.repository.activateConnection).toHaveBeenCalledTimes(1);
  });

  it("releases state after a transient OAuth exchange failure", async () => {
    const fixture = setup();
    fixture.repository.claimInstallationAttempt.mockResolvedValue(
      fixture.pendingAttempt,
    );
    fixture.clientFactory.exchangeOAuthCode.mockRejectedValue(
      new GitHubApiError("github_oauth_unavailable", "unavailable", true),
    );
    await expect(
      fixture.service.completeOAuthCallback("code", "state"),
    ).rejects.toMatchObject({ reason: "authorization_failed" });
    expect(fixture.repository.releaseInstallationAttempt).toHaveBeenCalledWith(
      "attempt-id",
    );
    expect(fixture.repository.consumeInstallationAttempt).not.toHaveBeenCalled();
  });

  it("consumes state when GitHub user retrieval fails after OAuth", async () => {
    const fixture = setup();
    fixture.repository.claimInstallationAttempt.mockResolvedValue(
      fixture.pendingAttempt,
    );
    fixture.clientFactory.exchangeOAuthCode.mockResolvedValue("temporary-token");
    fixture.userClient.getAuthenticatedUser.mockRejectedValue(
      new GitHubApiError("github_authentication_failed", "bad token", false),
    );
    fixture.userClient.listInstallations.mockResolvedValue([]);
    fixture.repository.consumeInstallationAttempt.mockResolvedValue({});
    await expect(
      fixture.service.completeOAuthCallback("code", "state"),
    ).rejects.toMatchObject({ reason: "authorization_failed" });
    expect(fixture.repository.consumeInstallationAttempt).toHaveBeenCalled();
  });

  it("rejects an installation inaccessible to the authorized user", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();
    fixture.userClient.listInstallations.mockResolvedValue([]);
    await expect(
      fixture.service.completeOAuthCallback("code", "state", 42),
    ).rejects.toMatchObject({ reason: "installation_not_authorized" });
    expect(fixture.appClient.getInstallation).not.toHaveBeenCalled();
  });

  it("rejects mismatched OAuth and App-authenticated account metadata", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();
    fixture.appClient.getInstallation.mockResolvedValue({
      ...installation,
      account: { ...installation.account, id: 99 },
    });
    await expect(
      fixture.service.completeOAuthCallback("code", "state", 42),
    ).rejects.toMatchObject({ reason: "installation_not_authorized" });
    expect(fixture.repository.activateConnection).not.toHaveBeenCalled();
  });

  it("rejects an installation already connected to another business", async () => {
    const fixture = setup();
    fixture.prepareSuccessfulCallback();
    fixture.repository.findConnectionByInstallation.mockResolvedValue({
      businessId: otherBusinessId,
    });
    await expect(
      fixture.service.completeOAuthCallback("code", "state", 42),
    ).rejects.toMatchObject({ reason: "already_connected" });
    expect(fixture.appClient.getInstallation).not.toHaveBeenCalled();
  });
});

describe("GitHubConnectionService existing operations", () => {
  it("rejects team targets from a different organization", async () => {
    const fixture = setup();
    fixture.repository.findConnection.mockResolvedValue({
      status: "active",
      installationId: 42,
      accountId: 9,
      accountLogin: "acme",
      accountType: "Organization",
    });
    await expect(
      fixture.service.validateTarget(businessId, {
        provider: "github",
        resourceType: "team",
        organizationId: 99,
        organizationLogin: "other",
        teamId: 2,
        teamSlug: "backend",
        role: "member",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fixture.installationClient.listTeams).not.toHaveBeenCalled();
  });

  it("verifies an employee identity with an active installation", async () => {
    const fixture = setup();
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId });
    fixture.repository.findConnection.mockResolvedValue({
      status: "active",
      installationId: 42,
    });
    fixture.installationClient.getUser.mockResolvedValue({ id: 11, login: "octocat" });
    fixture.repository.upsertIdentity.mockResolvedValue({
      username: "octocat",
      externalId: 11,
      verificationStatus: "verified",
    });
    await expect(
      fixture.service.setIdentity(businessId, employeeId, "octocat", userId),
    ).resolves.toMatchObject({ verificationStatus: "verified" });
  });
});
