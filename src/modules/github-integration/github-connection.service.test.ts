import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createGitHubConnectionService } from "./github-connection.service.js";

const businessId = "68b000000000000000000001";
const employeeId = "68b000000000000000000002";
const userId = "68b000000000000000000003";
const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

const setup = () => {
  const repository = {
    findConnection: vi.fn(), findConnectionByInstallation: vi.fn(), savePendingConnection: vi.fn(), consumePendingState: vi.fn(), activateConnection: vi.fn(), disconnectConnection: vi.fn(),
    findIdentity: vi.fn(), upsertIdentity: vi.fn(), deleteIdentity: vi.fn(), markBusinessGrantsNeedsConfiguration: vi.fn(),
  };
  const appClient = { getInstallation: vi.fn() };
  const installationClient = { listRepositories: vi.fn(), listTeams: vi.fn(), getUser: vi.fn() };
  const clientFactory = { isConfigured: vi.fn().mockReturnValue(true), installUrl: vi.fn((state: string) => `https://github.test/install?state=${state}`), forApp: vi.fn(() => appClient), forInstallation: vi.fn(() => installationClient) };
  const employeeRepository = { findByIdAndBusiness: vi.fn() };
  const auditService = { recordEventSafely: vi.fn() };
  const businessMemberRepository = { findActiveMembershipByBusinessAndUser: vi.fn().mockResolvedValue({ id: "member" }) };
  const enqueue = vi.fn();
  const enqueueBusiness = vi.fn();
  const service = createGitHubConnectionService({ repository: repository as never, employeeRepository: employeeRepository as never, businessMemberRepository: businessMemberRepository as never, clientFactory: clientFactory as never, auditService: auditService as never, createHttpError: httpError as never, enqueueEmployeeExternalReconciliation: enqueue, enqueueBusinessReconciliation: enqueueBusiness });
  return { service, repository, appClient, installationClient, employeeRepository, auditService, enqueue };
};

describe("GitHubConnectionService", () => {
  it("binds installation completion to a one-time business-scoped state", async () => {
    const fixture = setup();
    const install = await fixture.service.createInstallUrl(businessId);
    const state = new URL(install.url).searchParams.get("state")!;
    fixture.repository.consumePendingState.mockResolvedValue({ pendingStateHash: crypto.createHash("sha256").update(state).digest("hex") });
    fixture.repository.findConnectionByInstallation.mockResolvedValue(null);
    fixture.appClient.getInstallation.mockResolvedValue({ id: 42, account: { id: 9, login: "acme", type: "Organization" }, repository_selection: "selected", suspended_at: null });
    fixture.repository.activateConnection.mockResolvedValue({ businessId, installationId: 42, status: "active" });
    await expect(fixture.service.completeInstallation(businessId, userId, 42, state)).resolves.toMatchObject({ installationId: 42 });
    expect(fixture.repository.activateConnection).toHaveBeenCalledWith(businessId, expect.not.objectContaining({ token: expect.anything() }));
  });

  it("rejects an installation already connected to another business", async () => {
    const fixture = setup();
    const state = "s".repeat(32);
    fixture.repository.consumePendingState.mockResolvedValue({ pendingStateHash: crypto.createHash("sha256").update(state).digest("hex") });
    fixture.repository.findConnectionByInstallation.mockResolvedValue({ businessId: "68b000000000000000000009" });
    await expect(fixture.service.completeInstallation(businessId, userId, 42, state)).rejects.toMatchObject({ statusCode: 409 });
    expect(fixture.appClient.getInstallation).not.toHaveBeenCalled();
  });

  it("rejects resource discovery for a disconnected installation", async () => {
    const fixture = setup();
    fixture.repository.findConnection.mockResolvedValue({ businessId, status: "disconnected", installationId: 42 });
    await expect(fixture.service.listRepositories(businessId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("stores a verified identity using the immutable GitHub user id", async () => {
    const fixture = setup();
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.installationClient.getUser.mockResolvedValue({ id: 77, login: "Emeka" });
    fixture.repository.upsertIdentity.mockResolvedValue({ username: "Emeka", externalId: 77, verificationStatus: "verified" });
    await expect(fixture.service.setIdentity(businessId, employeeId, "emeka", userId)).resolves.toMatchObject({ externalId: 77, verificationStatus: "verified" });
    expect(fixture.repository.upsertIdentity).toHaveBeenCalledWith(businessId, employeeId, { username: "Emeka", externalId: 77, verificationStatus: "verified" });
    expect(fixture.enqueue).toHaveBeenCalledWith(businessId, employeeId, "github_identity.updated", userId);
  });

  it("rejects a team belonging to another organization", async () => {
    const fixture = setup();
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42, accountId: 9, accountLogin: "acme", accountType: "Organization" });
    await expect(fixture.service.validateTarget(businessId, { provider: "github", resourceType: "team", organizationId: 99, organizationLogin: "other", teamId: 2, teamSlug: "backend", role: "member" })).rejects.toMatchObject({ statusCode: 400 });
    expect(fixture.installationClient.listTeams).not.toHaveBeenCalled();
  });
});
