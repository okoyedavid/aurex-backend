import crypto from "node:crypto";
import type { HttpError } from "../../utils/api-error.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type {
  GitHubClientFactory,
  GitHubUser,
  GitHubUserInstallation,
} from "./github-client.js";
import { GitHubApiError } from "./github-client.js";
import type { GitHubIntegrationRepository } from "./github-integration.repository.js";
import type { GitHubTarget } from "./github-integration.types.js";

type Dependencies = {
  repository: GitHubIntegrationRepository;
  employeeRepository: EmployeeRepository;
  businessMemberRepository: BusinessMemberRepository;
  clientFactory: GitHubClientFactory;
  auditService: AuditEventService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
  enqueueEmployeeExternalReconciliation: (businessId: string, employeeId: string, reason: string, requestedBy?: string) => Promise<unknown>;
  enqueueBusinessReconciliation: (businessId: string, reason: string, requestedBy?: string) => Promise<unknown>;
};

const hashState = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export type GitHubCallbackFailureReason =
  | "invalid_state"
  | "expired_state"
  | "authorization_failed"
  | "installation_not_found"
  | "installation_not_authorized"
  | "already_connected";

export class GitHubCallbackError extends Error {
  constructor(
    public readonly reason: GitHubCallbackFailureReason,
    public readonly businessId: string | null = null,
  ) {
    super(`GitHub callback failed: ${reason}`);
  }
}

export const createGitHubConnectionService = ({ repository, employeeRepository, businessMemberRepository, clientFactory, auditService, withTransaction, createHttpError, enqueueEmployeeExternalReconciliation, enqueueBusinessReconciliation }: Dependencies) => {
  const memberId = async (businessId: string, userId: string) => {
    const member = await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, userId);
    return member?.id ?? null;
  };

  const activeConnection = async (businessId: string) => {
    const connection = await repository.findConnection(businessId);
    if (!connection || connection.status !== "active" || !connection.installationId) throw createHttpError("GitHub is not connected for this business", 409);
    return connection;
  };

  const getConnection = async (businessId: string) => {
    const connection = await repository.findConnection(businessId);
    return connection ?? { provider: "github", status: "disconnected" };
  };

  const createInstallUrl = async (
    businessId: string,
    userId: string,
    userSessionId: string,
    authSessionId?: string | null,
  ) => {
    if (!clientFactory.isConfigured()) throw createHttpError("GitHub App is not configured on this server", 503);
    const state = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await repository.createInstallationAttempt({
      stateHash: hashState(state),
      businessId,
      initiatedByUserId: userId,
      initiatedByUserSessionId: userSessionId,
      initiatedByAuthSessionId: authSessionId ?? null,
      expiresAt,
    });
    return { url: clientFactory.installUrl(state), expiresAt };
  };

  const verifyAndPersistInstallation = async (
    businessId: string,
    userId: string,
    installationId: number,
    authorizedInstallation: GitHubUserInstallation,
    authorizedUser: GitHubUser,
  ) => {
    const usedBy = await repository.findConnectionByInstallation(installationId);
    if (usedBy && String(usedBy.businessId) !== businessId) {
      throw new GitHubCallbackError("already_connected", businessId);
    }
    const installation = await clientFactory.forApp().getInstallation(installationId);
    if (
      installation.id !== authorizedInstallation.id ||
      installation.account.id !== authorizedInstallation.account.id ||
      installation.account.login.toLowerCase() !==
        authorizedInstallation.account.login.toLowerCase() ||
      installation.account.type !== authorizedInstallation.account.type
    ) {
      throw new GitHubCallbackError("installation_not_authorized", businessId);
    }
    const connection = await repository.activateConnection(businessId, installation);
    await auditService.recordEventSafely({ eventType: "github.connection.connected", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), subjectType: "business", subjectId: businessId, summary: `${installation.account.login} was connected to GitHub.`, metadata: { provider: "github", accountId: installation.account.id, accountLogin: installation.account.login, installationId, authorizedGitHubUserId: authorizedUser.id, authorizedGitHubLogin: authorizedUser.login } });
    await enqueueBusinessReconciliation(businessId, "github_connection.connected", userId);
    return connection;
  };

  const completeOAuthCallback = async (
    code: string,
    state: string,
    candidateInstallationId?: number,
  ) => {
    const stateHash = hashState(state);
    const attempt = await repository.claimInstallationAttempt(stateHash);
    if (!attempt) {
      const existing = await repository.findInstallationAttempt(stateHash);
      if (existing && existing.expiresAt <= new Date()) {
        throw new GitHubCallbackError(
          "expired_state",
          String(existing.businessId),
        );
      }
      throw new GitHubCallbackError(
        "invalid_state",
        existing ? String(existing.businessId) : null,
      );
    }

    const attemptId = String(attempt._id);
    const businessId = String(attempt.businessId);
    const userId = String(attempt.initiatedByUserId);
    let oauthTokenIssued = false;
    try {
      const oauthToken = await clientFactory.exchangeOAuthCode(code);
      oauthTokenIssued = true;
      const userClient = clientFactory.forUser(oauthToken);
      const [authorizedUser, accessibleInstallations] = await Promise.all([
        userClient.getAuthenticatedUser(),
        userClient.listInstallations(),
      ]);
      const authorizedInstallation = candidateInstallationId
        ? accessibleInstallations.find(
            (installation) => installation.id === candidateInstallationId,
          )
        : accessibleInstallations.length === 1
          ? accessibleInstallations[0]
          : null;
      if (!authorizedInstallation) {
        throw new GitHubCallbackError(
          candidateInstallationId
            ? "installation_not_authorized"
            : "installation_not_found",
          businessId,
        );
      }
      const connection = await verifyAndPersistInstallation(
        businessId,
        userId,
        authorizedInstallation.id,
        authorizedInstallation,
        authorizedUser,
      );
      const consumed = await repository.consumeInstallationAttempt(attemptId);
      if (!consumed) {
        throw new GitHubCallbackError("invalid_state", businessId);
      }
      return { businessId, connection };
    } catch (error) {
      const isRetryableBeforeToken =
        error instanceof GitHubApiError && error.retryable && !oauthTokenIssued;
      if (isRetryableBeforeToken) {
        await repository.releaseInstallationAttempt(attemptId);
      } else {
        await repository.consumeInstallationAttempt(attemptId);
      }
      if (error instanceof GitHubCallbackError) throw error;
      throw new GitHubCallbackError("authorization_failed", businessId);
    }
  };

  const disconnect = async (businessId: string, userId: string) => {
    const connection = await repository.disconnectConnection(businessId);
    if (!connection) throw createHttpError("GitHub connection not found", 404);
    await repository.markBusinessGrantsNeedsConfiguration(businessId);
    await auditService.recordEventSafely({ eventType: "github.connection.disconnected", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), subjectType: "business", subjectId: businessId, summary: "GitHub was disconnected from this business.", metadata: { provider: "github" } });
    return connection;
  };

  const listRepositories = async (businessId: string) => {
    const connection = await activeConnection(businessId);
    const response = await clientFactory.forInstallation(connection.installationId!).listRepositories();
    return response.repositories.map((repo) => ({ id: repo.id, owner: repo.owner.login, name: repo.name, fullName: repo.full_name, private: repo.private }));
  };

  const listTeams = async (businessId: string) => {
    const connection = await activeConnection(businessId);
    if (connection.accountType !== "Organization" || !connection.accountLogin) throw createHttpError("GitHub teams require an organization installation", 409);
    const teams = await clientFactory.forInstallation(connection.installationId!).listTeams(connection.accountLogin);
    return teams.map((team) => ({ id: team.id, slug: team.slug, name: team.name, organizationId: team.organization.id, organizationLogin: team.organization.login }));
  };

  const validateTarget = async (businessId: string, target: GitHubTarget) => {
    const connection = await activeConnection(businessId);
    if (target.resourceType === "team") {
      if (connection.accountId !== target.organizationId || connection.accountLogin?.toLowerCase() !== target.organizationLogin.toLowerCase()) throw createHttpError("GitHub team does not belong to this business installation", 400);
      const teams = await listTeams(businessId);
      if (!teams.some((team) => team.id === target.teamId && team.slug === target.teamSlug)) throw createHttpError("GitHub team is unavailable to this installation", 400);
    } else {
      const repositories = await listRepositories(businessId);
      if (!repositories.some((repo) => repo.id === target.repositoryId && repo.owner.toLowerCase() === target.owner.toLowerCase() && repo.name === target.repo)) throw createHttpError("GitHub repository is unavailable to this installation", 400);
    }
  };

  const getIdentity = async (businessId: string, employeeId: string) => {
    if (!await employeeRepository.findByIdAndBusiness(employeeId, businessId)) throw createHttpError("Employee not found in this business", 404);
    return repository.findIdentity(businessId, employeeId);
  };

  const setIdentity = async (businessId: string, employeeId: string, username: string, userId: string) => {
    const employee = await employeeRepository.findByIdAndBusiness(employeeId, businessId);
    if (!employee) throw createHttpError("Employee not found in this business", 404);
    const connection = await repository.findConnection(businessId);
    let resolved: { id: number; login: string } | null = null;
    if (connection?.status === "active" && connection.installationId) {
      try { resolved = await clientFactory.forInstallation(connection.installationId).getUser(username); }
      catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) throw createHttpError("GitHub user not found", 400);
        throw error;
      }
    }
    const proposed = { username: resolved?.login ?? username, externalId: resolved?.id ?? null, verificationStatus: resolved ? "verified" as const : "unverified" as const };
    const { identity, previous, principalChanged } = await withTransaction(async (session) => {
      const previous = await repository.findIdentity(businessId, employeeId, { session });
      const previousPrincipal = previous ? { externalId: previous.externalId ?? null, username: previous.username } : null;
      const proposedPrincipal = { externalId: proposed.externalId, username: proposed.username };
      const samePrincipal = Boolean(previousPrincipal) && (
        previousPrincipal!.externalId !== null && proposedPrincipal.externalId !== null
          ? previousPrincipal!.externalId === proposedPrincipal.externalId
          : previousPrincipal!.externalId === null && proposedPrincipal.externalId === null && previousPrincipal!.username.toLowerCase() === proposedPrincipal.username.toLowerCase()
      );
      const identity = await repository.upsertIdentity(businessId, employeeId, proposed, { session });
      if (previousPrincipal && samePrincipal) {
        await repository.refreshEmployeeGrantPrincipalMetadata(businessId, employeeId, previousPrincipal, proposedPrincipal, { session });
      } else {
        await repository.stageEmployeeGrantPrincipal(businessId, employeeId, proposedPrincipal, { session });
      }
      return { identity, previous, principalChanged: !samePrincipal };
    });
    const summary = previous
      ? `${employee.fullName}'s GitHub identity changed from @${previous.username} to @${identity.username}.`
      : `GitHub identity @${identity.username} was assigned to ${employee.fullName}.`;
    await auditService.recordEventSafely({ eventType: "github.identity.updated", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), employeeId, subjectType: "employee", subjectId: employeeId, summary, metadata: { provider: "github", employeeId, previousGitHubUserId: previous?.externalId ?? null, previousGitHubUsername: previous?.username ?? null, githubUserId: identity.externalId, githubUsername: identity.username, principalChanged } });
    await enqueueEmployeeExternalReconciliation(businessId, employeeId, "github_identity.updated", userId);
    return identity;
  };

  const removeIdentity = async (businessId: string, employeeId: string, userId: string) => {
    const employee = await employeeRepository.findByIdAndBusiness(employeeId, businessId);
    if (!employee) throw createHttpError("Employee not found in this business", 404);
    const identity = await withTransaction(async (session) => {
      const current = await repository.findIdentity(businessId, employeeId, { session });
      if (!current) throw createHttpError("GitHub identity not found", 404);
      await repository.stageEmployeeGrantPrincipal(businessId, employeeId, null, { session });
      const deleted = await repository.deleteIdentity(businessId, employeeId, { session });
      if (!deleted) throw createHttpError("GitHub identity not found", 404);
      return deleted;
    });
    await auditService.recordEventSafely({ eventType: "github.identity.removed", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), employeeId, subjectType: "employee", subjectId: employeeId, summary: `${employee.fullName}'s GitHub identity @${identity.username} was removed. Managed access will be removed from that account.`, metadata: { provider: "github", employeeId, githubUserId: identity.externalId, githubUsername: identity.username } });
    await enqueueEmployeeExternalReconciliation(businessId, employeeId, "github_identity.removed", userId);
    return identity;
  };

  return { activeConnection, completeOAuthCallback, createInstallUrl, disconnect, getConnection, getIdentity, listRepositories, listTeams, removeIdentity, setIdentity, validateTarget };
};

export type GitHubConnectionService = ReturnType<typeof createGitHubConnectionService>;
