export type GitHubTeamTarget = {
  provider: "github";
  resourceType: "team";
  organizationId: number;
  organizationLogin: string;
  teamId: number;
  teamSlug: string;
  role: "member";
};

export type GitHubRepositoryTarget = {
  provider: "github";
  resourceType: "repository";
  repositoryId: number;
  owner: string;
  repo: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin";
};

export type GitHubTarget = GitHubTeamTarget | GitHubRepositoryTarget;
export type DesiredAccessState = "granted" | "revoked";
export type GitHubPrincipalSnapshot = {
  externalId: number | null;
  username: string;
};
export type ActualAccessState =
  | "unknown"
  | "pending"
  | "granted"
  | "revoked"
  | "drifted"
  | "blocked"
  | "needs_configuration"
  | "failed"
  | "pending_acceptance"
  | "retained_external";

export const githubTarget = (value: unknown): GitHubTarget | null => {
  if (!value || typeof value !== "object") return null;
  const target = value as Record<string, unknown>;
  if (target.provider !== "github") return null;
  if (
    target.resourceType === "team" &&
    typeof target.organizationId === "number" &&
    typeof target.organizationLogin === "string" &&
    typeof target.teamId === "number" &&
    typeof target.teamSlug === "string" &&
    target.role === "member"
  ) return target as GitHubTeamTarget;
  if (
    target.resourceType === "repository" &&
    typeof target.repositoryId === "number" &&
    typeof target.owner === "string" &&
    typeof target.repo === "string" &&
    ["pull", "triage", "push", "maintain", "admin"].includes(String(target.permission))
  ) return target as GitHubRepositoryTarget;
  return null;
};

export const githubResourceKey = (target: GitHubTarget) =>
  target.resourceType === "team"
    ? `team:${target.teamId}`
    : `repository:${target.repositoryId}`;

export const githubResourceName = (target: GitHubTarget) =>
  target.resourceType === "team"
    ? target.teamSlug
    : `${target.owner}/${target.repo}`;
