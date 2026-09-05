import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export type GitHubInstallation = {
  id: number;
  account: { id: number; login: string; type: "Organization" | "User" };
  repository_selection: "all" | "selected";
  suspended_at: string | null;
};

export class GitHubApiError extends Error {
  readonly statusCode: number;
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.statusCode = retryable ? 503 : status === 403 || status === 404 || status === 422 ? 422 : 502;
  }
}

const normalizedError = (status: number, fallback: string, rateLimited = false) => {
  if (status === 401) return new GitHubApiError("github_authentication_failed", "GitHub App authentication failed", false, status);
  if (status === 403 && rateLimited) return new GitHubApiError("github_rate_limited", "GitHub rate limit reached", true, status);
  if (status === 403) return new GitHubApiError("github_permission_denied", "The GitHub App does not have permission to change this resource, or the team is externally managed", false, status);
  if (status === 404) return new GitHubApiError("github_resource_not_found", "The GitHub resource is unavailable to this installation", false, status);
  if (status === 422) return new GitHubApiError("github_request_rejected", "GitHub rejected the requested access change", false, status);
  if (status === 429 || status >= 500) return new GitHubApiError("github_temporarily_unavailable", "GitHub is temporarily unavailable", true, status);
  return new GitHubApiError("github_request_failed", fallback, false, status);
};

type RequestOptions = { method?: string; body?: unknown; appAuthentication?: boolean };

export class GitHubClient {
  constructor(
    private readonly installationId: number | null,
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly baseUrl: string,
    private readonly transport: typeof fetch = fetch,
  ) {}

  private appJwt() {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({ iat: now - 60, exp: now + 9 * 60, iss: this.appId }, this.privateKey.replace(/\\n/g, "\n"), { algorithm: "RS256" });
  }

  private async installationToken() {
    if (!this.installationId) throw new GitHubApiError("github_installation_missing", "GitHub is not connected", false);
    const result = await this.request<{ token: string }>(`/app/installations/${this.installationId}/access_tokens`, { method: "POST", appAuthentication: true });
    return result.token;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let authorization: string;
    try {
      authorization = options.appAuthentication
        ? `Bearer ${this.appJwt()}`
        : `Bearer ${await this.installationToken()}`;
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError("github_authentication_failed", "GitHub App authentication failed", false);
    }
    let response: Response;
    try {
      response = await this.transport(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: authorization,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new GitHubApiError("github_network_error", "GitHub could not be reached", true);
    }
    if (!response.ok) throw normalizedError(response.status, "GitHub rejected the request", response.headers.get("x-ratelimit-remaining") === "0");
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  getInstallation(installationId: number) {
    return this.request<GitHubInstallation>(`/app/installations/${installationId}`, { appAuthentication: true });
  }

  async listRepositories() {
    const repositories: Array<{ id: number; name: string; full_name: string; private: boolean; owner: { login: string } }> = [];
    for (let page = 1; ; page += 1) {
      const result = await this.request<{ repositories: typeof repositories }>(`/installation/repositories?per_page=100&page=${page}`);
      repositories.push(...result.repositories);
      if (result.repositories.length < 100) break;
    }
    return { repositories };
  }

  async listTeams(organizationLogin: string) {
    const teams: Array<{ id: number; slug: string; name: string; organization: { id: number; login: string } }> = [];
    for (let page = 1; ; page += 1) {
      const result = await this.request<typeof teams>(`/orgs/${encodeURIComponent(organizationLogin)}/teams?per_page=100&page=${page}`);
      teams.push(...result);
      if (result.length < 100) break;
    }
    return teams;
  }

  getUser(username: string) {
    return this.request<{ id: number; login: string }>(`/users/${encodeURIComponent(username)}`);
  }

  getTeamMembership(organization: string, teamSlug: string, username: string) {
    return this.request<{ state: "active" | "pending"; role: "member" | "maintainer" }>(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`);
  }

  putTeamMembership(organization: string, teamSlug: string, username: string) {
    return this.request<{ state: "active" | "pending"; role: "member" | "maintainer" }>(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`, { method: "PUT", body: { role: "member" } });
  }

  deleteTeamMembership(organization: string, teamSlug: string, username: string) {
    return this.request<void>(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`, { method: "DELETE" });
  }

  getRepositoryPermission(owner: string, repo: string, username: string) {
    return this.request<{ permission: string; user?: { permissions?: Record<string, boolean> } }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}/permission`);
  }

  putRepositoryCollaborator(owner: string, repo: string, username: string, permission: string) {
    return this.request<{ id?: number } | undefined>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`, { method: "PUT", body: { permission } });
  }

  deleteRepositoryCollaborator(owner: string, repo: string, username: string) {
    return this.request<void>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`, { method: "DELETE" });
  }
}

export type GitHubClientLike = Pick<GitHubClient, "getInstallation" | "listRepositories" | "listTeams" | "getUser" | "getTeamMembership" | "putTeamMembership" | "deleteTeamMembership" | "getRepositoryPermission" | "putRepositoryCollaborator" | "deleteRepositoryCollaborator">;

export const createGitHubClientFactory = (configuration = env) => ({
  isConfigured: () => Boolean(configuration.GITHUB_APP_ID && (configuration.GITHUB_APP_PRIVATE_KEY || configuration.GITHUB_APP_PRIVATE_KEY_B64) && configuration.GITHUB_APP_SLUG),
  installUrl: (state: string) => {
    if (!configuration.GITHUB_APP_SLUG) throw new GitHubApiError("github_app_not_configured", "GitHub App is not configured", false);
    return `https://github.com/apps/${encodeURIComponent(configuration.GITHUB_APP_SLUG)}/installations/new?state=${encodeURIComponent(state)}`;
  },
  forApp: () => {
    const privateKey = configuration.GITHUB_APP_PRIVATE_KEY ?? (configuration.GITHUB_APP_PRIVATE_KEY_B64 ? Buffer.from(configuration.GITHUB_APP_PRIVATE_KEY_B64, "base64").toString("utf8") : null);
    if (!configuration.GITHUB_APP_ID || !privateKey) throw new GitHubApiError("github_app_not_configured", "GitHub App is not configured", false);
    return new GitHubClient(null, configuration.GITHUB_APP_ID, privateKey, configuration.GITHUB_API_BASE_URL);
  },
  forInstallation: (installationId: number) => {
    const privateKey = configuration.GITHUB_APP_PRIVATE_KEY ?? (configuration.GITHUB_APP_PRIVATE_KEY_B64 ? Buffer.from(configuration.GITHUB_APP_PRIVATE_KEY_B64, "base64").toString("utf8") : null);
    if (!configuration.GITHUB_APP_ID || !privateKey) throw new GitHubApiError("github_app_not_configured", "GitHub App is not configured", false);
    return new GitHubClient(installationId, configuration.GITHUB_APP_ID, privateKey, configuration.GITHUB_API_BASE_URL);
  },
});

export type GitHubClientFactory = ReturnType<typeof createGitHubClientFactory>;
