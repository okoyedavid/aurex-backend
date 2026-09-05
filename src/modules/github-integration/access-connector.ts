import { GitHubApiError, type GitHubClientLike } from "./github-client.js";
import type { ActualAccessState, DesiredAccessState, GitHubTarget } from "./github-integration.types.js";

export type AccessObservation = {
  state: "present" | "absent" | "pending";
  permission?: string;
};

export type AccessExecutionResult = {
  actualState: ActualAccessState;
  changed: boolean;
  managedGrantCreated: boolean;
  effectivePermission?: string | null;
  baselinePermission?: string | null;
};

export interface AccessConnector<TTarget> {
  readActualState(target: TTarget, username: string): Promise<AccessObservation>;
  ensureGranted(target: TTarget, username: string, managedGrantCreated: boolean, baselinePermission?: string | null): Promise<AccessExecutionResult>;
  ensureRevoked(target: TTarget, username: string, managedGrantCreated: boolean, baselinePermission?: string | null): Promise<AccessExecutionResult>;
  verify(target: TTarget, username: string, desiredState: DesiredAccessState): Promise<AccessObservation>;
}

const absentOn404 = async <T>(operation: () => Promise<T>): Promise<T | null> => {
  try { return await operation(); }
  catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
};

export class GitHubAccessConnector implements AccessConnector<GitHubTarget> {
  constructor(private readonly client: GitHubClientLike) {}

  async readActualState(target: GitHubTarget, username: string): Promise<AccessObservation> {
    if (target.resourceType === "team") {
      const membership = await absentOn404(() => this.client.getTeamMembership(target.organizationLogin, target.teamSlug, username));
      if (!membership) return { state: "absent" };
      return { state: membership.state === "active" ? "present" : "pending", permission: membership.role };
    }
    const permission = await absentOn404(() => this.client.getRepositoryPermission(target.owner, target.repo, username));
    return permission ? { state: "present", permission: permission.permission } : { state: "absent" };
  }

  async ensureGranted(target: GitHubTarget, username: string, managedGrantCreated: boolean, baselinePermission?: string | null): Promise<AccessExecutionResult> {
    const before = await this.readActualState(target, username);
    if (target.resourceType === "team") {
      if (before.state === "present") return { actualState: "granted", changed: false, managedGrantCreated };
      const response = await this.client.putTeamMembership(target.organizationLogin, target.teamSlug, username);
      const verified = await this.readActualState(target, username);
      return {
        actualState: response.state === "pending" || verified.state === "pending" ? "pending_acceptance" : verified.state === "present" ? "granted" : "failed",
        changed: true,
        managedGrantCreated: true,
      };
    }
    if (before.state === "present" && before.permission === target.permission) {
      return { actualState: "granted", changed: false, managedGrantCreated, effectivePermission: before.permission };
    }
    const response = await this.client.putRepositoryCollaborator(target.owner, target.repo, username, target.permission);
    if (response && typeof response.id === "number") {
      return { actualState: "pending_acceptance", changed: true, managedGrantCreated: true, effectivePermission: before.permission ?? null };
    }
    const verified = await this.readActualState(target, username);
    return { actualState: verified.state === "present" && verified.permission === target.permission ? "granted" : "failed", changed: true, managedGrantCreated: true, effectivePermission: verified.permission ?? null, baselinePermission: baselinePermission ?? (managedGrantCreated ? null : before.permission ?? null) };
  }

  async ensureRevoked(target: GitHubTarget, username: string, managedGrantCreated: boolean, baselinePermission?: string | null): Promise<AccessExecutionResult> {
    const before = await this.readActualState(target, username);
    if (before.state === "absent") return { actualState: "revoked", changed: false, managedGrantCreated: false };
    if (!managedGrantCreated) {
      return { actualState: "retained_external", changed: false, managedGrantCreated: false, effectivePermission: before.permission ?? null };
    }
    if (target.resourceType === "team") {
      await this.client.deleteTeamMembership(target.organizationLogin, target.teamSlug, username);
      const verified = await this.readActualState(target, username);
      return { actualState: verified.state === "absent" ? "revoked" : "failed", changed: true, managedGrantCreated: verified.state !== "absent" };
    }
    if (baselinePermission) {
      await this.client.putRepositoryCollaborator(target.owner, target.repo, username, baselinePermission);
      const restored = await this.readActualState(target, username);
      return { actualState: "retained_external", changed: true, managedGrantCreated: false, baselinePermission: null, effectivePermission: restored.permission ?? baselinePermission };
    }
    await this.client.deleteRepositoryCollaborator(target.owner, target.repo, username);
    const effective = await this.readActualState(target, username);
    return {
      actualState: effective.state === "absent" ? "revoked" : "retained_external",
      changed: true,
      managedGrantCreated: false,
      effectivePermission: effective.permission ?? null,
    };
  }

  verify(target: GitHubTarget, username: string, _desiredState: DesiredAccessState) {
    return this.readActualState(target, username);
  }
}
