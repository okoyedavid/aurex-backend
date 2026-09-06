import { describe, expect, it, vi } from "vitest";
import { GitHubAccessConnector } from "./access-connector.js";
import { GitHubApiError, type GitHubClientLike } from "./github-client.js";
import type { GitHubRepositoryTarget, GitHubTeamTarget } from "./github-integration.types.js";

const team: GitHubTeamTarget = { provider: "github", resourceType: "team", organizationId: 1, organizationLogin: "acme", teamId: 2, teamSlug: "backend", role: "member" };
const repository: GitHubRepositoryTarget = { provider: "github", resourceType: "repository", repositoryId: 3, owner: "acme", repo: "api", permission: "push" };

const client = (overrides: Partial<GitHubClientLike> = {}) => ({
  getInstallation: vi.fn(), listRepositories: vi.fn(), listTeams: vi.fn(), getUser: vi.fn(),
  getTeamMembership: vi.fn(), putTeamMembership: vi.fn(), deleteTeamMembership: vi.fn(),
  getRepositoryPermission: vi.fn(), putRepositoryCollaborator: vi.fn(), deleteRepositoryCollaborator: vi.fn(),
  ...overrides,
}) as unknown as GitHubClientLike;

const missing = () => Promise.reject(new GitHubApiError("github_resource_not_found", "Not found", false, 404));

describe("GitHubAccessConnector", () => {
  it("grants an absent team membership and verifies it", async () => {
    const get = vi.fn().mockImplementationOnce(missing).mockResolvedValueOnce({ state: "active", role: "member" });
    const api = client({ getTeamMembership: get, putTeamMembership: vi.fn().mockResolvedValue({ state: "active", role: "member" }) });
    await expect(new GitHubAccessConnector(api).ensureGranted(team, "emeka", false)).resolves.toMatchObject({ actualState: "granted", changed: true, managedGrantCreated: true });
    expect(api.putTeamMembership).toHaveBeenCalledOnce();
  });

  it("does not mutate an existing team membership", async () => {
    const api = client({ getTeamMembership: vi.fn().mockResolvedValue({ state: "active", role: "member" }) });
    await expect(new GitHubAccessConnector(api).ensureGranted(team, "emeka", false)).resolves.toMatchObject({ actualState: "granted", changed: false, managedGrantCreated: false });
    expect(api.putTeamMembership).not.toHaveBeenCalled();
  });

  it("revokes an Aurex-created team membership and verifies absence", async () => {
    const get = vi.fn().mockResolvedValueOnce({ state: "active", role: "member" }).mockImplementationOnce(missing);
    const api = client({ getTeamMembership: get, deleteTeamMembership: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(team, "emeka", true)).resolves.toMatchObject({ actualState: "revoked", changed: true, managedGrantCreated: false });
  });

  it("treats an already absent grant as an idempotent revoke", async () => {
    const api = client({ getTeamMembership: vi.fn().mockImplementation(missing) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(team, "emeka", true)).resolves.toMatchObject({ actualState: "revoked", changed: false });
    expect(api.deleteTeamMembership).not.toHaveBeenCalled();
  });

  it("does not remove a team membership Aurex did not create", async () => {
    const api = client({ getTeamMembership: vi.fn().mockResolvedValue({ state: "active", role: "member" }) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(team, "emeka", false)).resolves.toMatchObject({ actualState: "retained_external", changed: false });
    expect(api.deleteTeamMembership).not.toHaveBeenCalled();
  });

  it("surfaces normalized permission errors for externally managed teams", async () => {
    const api = client({ getTeamMembership: vi.fn().mockImplementation(missing), putTeamMembership: vi.fn().mockRejectedValue(new GitHubApiError("github_permission_denied", "The team is externally managed", false, 403)) });
    await expect(new GitHubAccessConnector(api).ensureGranted(team, "emeka", false)).rejects.toMatchObject({ code: "github_permission_denied", retryable: false });
  });

  it("does not update a repository collaborator with the correct permission", async () => {
    const api = client({ getRepositoryPermission: vi.fn().mockResolvedValue({ permission: "push" }) });
    await expect(new GitHubAccessConnector(api).ensureGranted(repository, "emeka", false)).resolves.toMatchObject({ actualState: "granted", changed: false });
    expect(api.putRepositoryCollaborator).not.toHaveBeenCalled();
  });

  it("updates a wrong repository permission", async () => {
    const get = vi.fn().mockResolvedValueOnce({ permission: "pull" }).mockResolvedValueOnce({ permission: "push" });
    const api = client({ getRepositoryPermission: get, putRepositoryCollaborator: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureGranted(repository, "emeka", false)).resolves.toMatchObject({ actualState: "granted", changed: true, managedGrantCreated: true, baselinePermission: "pull" });
  });

  it("grants an absent repository collaborator and verifies permission", async () => {
    const get = vi.fn().mockImplementationOnce(missing).mockResolvedValueOnce({ permission: "push" });
    const api = client({ getRepositoryPermission: get, putRepositoryCollaborator: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureGranted(repository, "emeka", false)).resolves.toMatchObject({ actualState: "granted", changed: true, managedGrantCreated: true });
  });

  it("models a repository invitation as pending acceptance", async () => {
    const api = client({ getRepositoryPermission: vi.fn().mockImplementation(missing), putRepositoryCollaborator: vi.fn().mockResolvedValue({ id: 99 }) });
    await expect(new GitHubAccessConnector(api).ensureGranted(repository, "emeka", false)).resolves.toMatchObject({ actualState: "pending_acceptance", changed: true });
  });

  it("reports effective repository access remaining after direct removal", async () => {
    const get = vi.fn().mockResolvedValueOnce({ permission: "push" }).mockResolvedValueOnce({ permission: "pull" });
    const api = client({ getRepositoryPermission: get, deleteRepositoryCollaborator: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(repository, "emeka", true)).resolves.toMatchObject({ actualState: "retained_external", changed: true, effectivePermission: "pull" });
  });

  it("removes an Aurex-created direct grant when no effective access remains", async () => {
    const get = vi.fn().mockResolvedValueOnce({ permission: "push" }).mockImplementationOnce(missing);
    const api = client({ getRepositoryPermission: get, deleteRepositoryCollaborator: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(repository, "emeka", true)).resolves.toMatchObject({ actualState: "revoked", changed: true });
  });

  it("restores a pre-existing direct permission instead of deleting it", async () => {
    const get = vi.fn().mockResolvedValueOnce({ permission: "push" }).mockResolvedValueOnce({ permission: "pull" });
    const api = client({ getRepositoryPermission: get, putRepositoryCollaborator: vi.fn().mockResolvedValue(undefined) });
    await expect(new GitHubAccessConnector(api).ensureRevoked(repository, "emeka", true, "pull")).resolves.toMatchObject({ actualState: "retained_external", effectivePermission: "pull", managedGrantCreated: false });
    expect(api.deleteRepositoryCollaborator).not.toHaveBeenCalled();
  });
});
