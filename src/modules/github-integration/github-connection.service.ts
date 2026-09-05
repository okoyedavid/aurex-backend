import crypto from "node:crypto";
import type { HttpError } from "../../utils/api-error.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { GitHubClientFactory } from "./github-client.js";
import { GitHubApiError } from "./github-client.js";
import type { GitHubIntegrationRepository } from "./github-integration.repository.js";
import type { GitHubTarget } from "./github-integration.types.js";

type Dependencies = {
  repository: GitHubIntegrationRepository;
  employeeRepository: EmployeeRepository;
  businessMemberRepository: BusinessMemberRepository;
  clientFactory: GitHubClientFactory;
  auditService: AuditEventService;
  createHttpError: (message: string, statusCode: number) => HttpError;
  enqueueEmployeeExternalReconciliation: (businessId: string, employeeId: string, reason: string, requestedBy?: string) => Promise<unknown>;
  enqueueBusinessReconciliation: (businessId: string, reason: string, requestedBy?: string) => Promise<unknown>;
};

const hashState = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const createGitHubConnectionService = ({ repository, employeeRepository, businessMemberRepository, clientFactory, auditService, createHttpError, enqueueEmployeeExternalReconciliation, enqueueBusinessReconciliation }: Dependencies) => {
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

  const createInstallUrl = async (businessId: string) => {
    if (!clientFactory.isConfigured()) throw createHttpError("GitHub App is not configured on this server", 503);
    const state = crypto.randomBytes(32).toString("base64url");
    await repository.savePendingConnection(businessId, hashState(state), new Date(Date.now() + 10 * 60_000));
    return { url: clientFactory.installUrl(state), expiresAt: new Date(Date.now() + 10 * 60_000) };
  };

  const completeInstallation = async (businessId: string, userId: string, installationId: number, state: string) => {
    const suppliedHash = hashState(state);
    const pending = await repository.consumePendingState(businessId, suppliedHash);
    if (!pending) throw createHttpError("GitHub installation state is invalid, expired, or already used", 400);
    const usedBy = await repository.findConnectionByInstallation(installationId);
    if (usedBy && String(usedBy.businessId) !== businessId) throw createHttpError("This GitHub installation is already connected to another business", 409);
    const installation = await clientFactory.forApp().getInstallation(installationId);
    const connection = await repository.activateConnection(businessId, installation);
    await auditService.recordEventSafely({ eventType: "github.connection.connected", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), subjectType: "business", subjectId: businessId, summary: `${installation.account.login} was connected to GitHub.`, metadata: { provider: "github", accountId: installation.account.id, accountLogin: installation.account.login, installationId } });
    await enqueueBusinessReconciliation(businessId, "github_connection.connected", userId);
    return connection;
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
    if (!await employeeRepository.findByIdAndBusiness(employeeId, businessId)) throw createHttpError("Employee not found in this business", 404);
    const connection = await repository.findConnection(businessId);
    let resolved: { id: number; login: string } | null = null;
    if (connection?.status === "active" && connection.installationId) {
      try { resolved = await clientFactory.forInstallation(connection.installationId).getUser(username); }
      catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) throw createHttpError("GitHub user not found", 400);
        throw error;
      }
    }
    const identity = await repository.upsertIdentity(businessId, employeeId, { username: resolved?.login ?? username, externalId: resolved?.id ?? null, verificationStatus: resolved ? "verified" : "unverified" });
    await auditService.recordEventSafely({ eventType: "github.identity.updated", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), employeeId, subjectType: "employee", subjectId: employeeId, summary: `GitHub identity @${identity.username} was assigned to the employee.`, metadata: { provider: "github", employeeId, githubUserId: identity.externalId, githubUsername: identity.username } });
    await enqueueEmployeeExternalReconciliation(businessId, employeeId, "github_identity.updated", userId);
    return identity;
  };

  const removeIdentity = async (businessId: string, employeeId: string, userId: string) => {
    if (!await employeeRepository.findByIdAndBusiness(employeeId, businessId)) throw createHttpError("Employee not found in this business", 404);
    const identity = await repository.deleteIdentity(businessId, employeeId);
    if (!identity) throw createHttpError("GitHub identity not found", 404);
    await auditService.recordEventSafely({ eventType: "github.identity.removed", category: "business", outcome: "success", userId, email: null, businessId, actorBusinessMemberId: await memberId(businessId, userId), employeeId, subjectType: "employee", subjectId: employeeId, summary: `GitHub identity @${identity.username} was removed from the employee.`, metadata: { provider: "github", employeeId, githubUserId: identity.externalId, githubUsername: identity.username } });
    await enqueueEmployeeExternalReconciliation(businessId, employeeId, "github_identity.removed", userId);
    return identity;
  };

  return { activeConnection, completeInstallation, createInstallUrl, disconnect, getConnection, getIdentity, listRepositories, listTeams, removeIdentity, setIdentity, validateTarget };
};

export type GitHubConnectionService = ReturnType<typeof createGitHubConnectionService>;
