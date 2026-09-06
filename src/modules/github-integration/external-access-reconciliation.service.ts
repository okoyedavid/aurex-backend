import crypto from "node:crypto";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import { GitHubAccessConnector } from "./access-connector.js";
import { GitHubApiError, type GitHubClientFactory } from "./github-client.js";
import type { GitHubIntegrationRepository } from "./github-integration.repository.js";
import {
  githubResourceKey,
  githubResourceName,
  githubTarget,
  type ActualAccessState,
} from "./github-integration.types.js";

type Dependencies = {
  repository: GitHubIntegrationRepository;
  employeeRepository: EmployeeRepository;
  clientFactory: GitHubClientFactory;
  auditService: AuditEventService;
};

export class ExternalAccessConfigurationError extends Error {}

export const createExternalAccessReconciliationService = ({
  repository,
  employeeRepository,
  clientFactory,
  auditService,
}: Dependencies) => {
  const syncEmployeeDesiredAccess = async (
    businessId: string,
    employeeId: string,
  ) => {
    const [pairs, existing, identity] = await Promise.all([
      repository.findActiveAssignmentsWithPolicies(businessId, employeeId),
      repository.listGrantsForEmployee(businessId, employeeId),
      repository.findIdentity(businessId, employeeId),
    ]);
    const desiredGrantIds = new Set<string>();
    const grants = [];
    for (const { assignment, policy } of pairs) {
      const target = githubTarget(policy.configuration);
      if (!target) continue;
      const resourceExternalId = githubResourceKey(target);
      const grant = await repository.upsertDesiredGrant({
        businessId,
        employeeId,
        assignmentId: assignment.id,
        policyId: policy.id,
        policyVersion: assignment.policyVersion,
        assignmentSource: assignment.source,
        target,
        resourceExternalId,
        resourceDisplayName: githubResourceName(target),
        desiredPrincipal: identity
          ? { externalId: identity.externalId ?? null, username: identity.username }
          : null,
      });
      if (grant) {
        desiredGrantIds.add(grant.id);
        grants.push(grant);
      }
    }
    for (const grant of existing) {
      if (desiredGrantIds.has(grant.id)) continue;
      const revoked =
        grant.desiredState === "revoked"
          ? grant
          : await repository.markDesiredRevoked(businessId, grant.id);
      if (revoked) grants.push(revoked);
    }
    return grants;
  };

  const auditResult = async (
    grant: Awaited<ReturnType<GitHubIntegrationRepository["findGrant"]>>,
    employeeName: string,
    username: string,
    state: ActualAccessState,
    executionAttemptId: string,
  ) => {
    if (!grant) return;
    const auditState = `${grant.desiredRevision}:${state}:${username.toLowerCase()}`;
    if (grant.lastAuditState === auditState) return;
    const target = githubTarget(grant.target);
    if (!target) return;
    let eventType:
      | "github.access.granted"
      | "github.access.revoked"
      | "github.access.pending_acceptance"
      | "github.access.retained_external"
      | "github.access.blocked"
      | "github.access.failed";
    let summary: string;
    if (state === "granted") {
      eventType = "github.access.granted";
      summary =
        target.resourceType === "team"
          ? `GitHub access to the ${grant.resourceDisplayName} team was granted to @${username} for ${employeeName}.`
          : `GitHub repository access to ${grant.resourceDisplayName} was granted to @${username} for ${employeeName}.`;
    } else if (state === "revoked") {
      eventType = "github.access.revoked";
      summary = `Aurex-managed GitHub access to ${grant.resourceDisplayName} was removed from @${username} for ${employeeName}.`;
    } else if (state === "pending_acceptance") {
      eventType = "github.access.pending_acceptance";
      summary = `GitHub access is awaiting ${employeeName}'s invitation acceptance.`;
    } else if (state === "retained_external") {
      eventType = "github.access.retained_external";
      summary = `Aurex stopped managing ${employeeName}'s access to ${grant.resourceDisplayName}, but GitHub access remains through another source.`;
    } else if (state === "failed") {
      eventType = "github.access.failed";
      summary = `GitHub access for ${employeeName} could not be reconciled.`;
    } else {
      eventType = "github.access.blocked";
      summary =
        grant.lastErrorMessage ??
        `GitHub access for ${employeeName} needs configuration.`;
    }
    const claimed = await repository.claimGrantAuditState(String(grant.businessId), grant.id, grant.desiredRevision, auditState, state);
    if (!claimed) return;
    await auditService.recordEventSafely({
      eventType,
      category: "business",
      outcome:
        state === "failed"
          ? "failure"
          : state === "blocked" || state === "needs_configuration"
            ? "blocked"
            : "success",
      userId: null,
      email: null,
      businessId: String(grant.businessId),
      employeeId: String(grant.employeeId),
      subjectType: "employee",
      subjectId: String(grant.employeeId),
      summary,
      metadata: {
        provider: "github",
        resourceType: grant.resourceType,
        resourceId: grant.resourceExternalId,
        resourceDisplayName: grant.resourceDisplayName,
        employeeId: String(grant.employeeId),
        githubUsername: username,
        policyId: String(grant.policyId),
        assignmentId: String(grant.assignmentId),
        desiredState: grant.desiredState,
        actualState: state,
        automatic: grant.assignmentSource === "rule",
        executionAttemptId,
      },
    });
  };

  const recordConfigurationState = async (
    grant: NonNullable<
      Awaited<ReturnType<GitHubIntegrationRepository["findGrant"]>>
    >,
    employeeName: string,
    code: string,
    message: string,
    expectedRevision = grant.desiredRevision,
  ) => {
    const state: ActualAccessState =
      code === "github_permission_denied" ? "blocked" : "needs_configuration";
    const updated = await repository.updateGrantResult(
      String(grant.businessId),
      grant.id,
      {
        actualState: state,
        lastAttemptAt: new Date(),
        lastErrorCode: code,
        lastErrorMessage: message,
      },
      expectedRevision,
    );
    if (!updated) return { stale: true as const };
    await auditResult(
      updated,
      employeeName,
      "unconfigured",
      state,
      crypto.randomUUID(),
    );
    return updated;
  };

  const enforceGrant = async (
    businessId: string,
    grantId: string,
    expectedRevision?: number,
  ) => {
    let grant = await repository.findGrant(businessId, grantId);
    if (
      !grant ||
      (expectedRevision && grant.desiredRevision !== expectedRevision)
    )
      return { stale: true };
    const employee = await employeeRepository.findByIdAndBusiness(
      String(grant.employeeId),
      businessId,
    );
    if (!employee)
      return recordConfigurationState(
        grant,
        "Employee",
        "employee_missing",
        "GitHub access needs configuration because the employee no longer exists.",
      );
    const connection = await repository.findConnection(businessId);
    if (
      !connection ||
      connection.status !== "active" ||
      !connection.installationId
    )
      return recordConfigurationState(
        grant,
        employee.fullName,
        "github_connection_inactive",
        "GitHub access needs configuration because the integration is disconnected.",
      );
    const target = githubTarget(grant.target);
    if (!target)
      return recordConfigurationState(
        grant,
        employee.fullName,
        "github_target_invalid",
        "GitHub access needs configuration because the policy target is invalid.",
      );
    const revision = grant.desiredRevision;
    const executionAttemptId = crypto.randomUUID();
    const pending = await repository.updateGrantResult(businessId, grantId, {
      actualState: "pending",
      lastAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    }, revision);
    if (!pending) return { stale: true };
    grant = pending;
    try {
      const connector = new GitHubAccessConnector(
        clientFactory.forInstallation(connection.installationId),
      );

      const samePrincipal = (left: { externalId: number | null; username: string } | null, right: { externalId: number | null; username: string } | null) => {
        if (!left || !right) return left === right;
        if (left.externalId !== null && right.externalId !== null) return left.externalId === right.externalId;
        if (left.externalId !== null || right.externalId !== null) return false;
        return left.username.toLowerCase() === right.username.toLowerCase();
      };
      const managedPrincipal = () => grant!.managedPrincipalUsername
        ? { externalId: grant!.managedPrincipalExternalId ?? null, username: grant!.managedPrincipalUsername }
        : null;
      const desiredPrincipal = () => grant!.desiredPrincipalUsername
        ? { externalId: grant!.desiredPrincipalExternalId ?? null, username: grant!.desiredPrincipalUsername }
        : null;

      // A crash may leave a principal for which a grant operation was in flight.
      // Remove it first unless it has already become the finalized managed principal.
      if (grant.pendingPrincipalUsername && !samePrincipal(
        { externalId: grant.pendingPrincipalExternalId ?? null, username: grant.pendingPrincipalUsername },
        managedPrincipal(),
      )) {
        const cleanup = await connector.ensureRevoked(target, grant.pendingPrincipalUsername, grant.pendingManagedGrantCreated, grant.pendingBaselinePermission);
        if (cleanup.actualState === "failed") throw new GitHubApiError("github_verification_failed", "GitHub access cleanup verification failed", true);
        const cleaned = await repository.updateGrantResult(businessId, grantId, {
          actualState: "pending",
          pendingPrincipalExternalId: null,
          pendingPrincipalUsername: null,
          pendingManagedGrantCreated: false,
          pendingBaselinePermission: null,
        }, revision);
        if (!cleaned) return { stale: true };
        grant = cleaned;
      }

      // Legacy managed grants did not retain their principal. Bind only when the
      // current verified identity is observed on the exact managed resource.
      if (!managedPrincipal() && grant.managedGrantCreated) {
        const identity = await repository.findIdentity(businessId, String(grant.employeeId));
        const candidate = desiredPrincipal() ?? (identity?.verificationStatus === "verified"
          ? { externalId: identity.externalId ?? null, username: identity.username }
          : null);
        if (!candidate || candidate.externalId === null) {
          return recordConfigurationState(grant, employee.fullName, "github_managed_principal_unknown", "GitHub access needs configuration because the account that received this legacy managed grant cannot be established safely.", revision);
        }
        const observed = await connector.readActualState(target, candidate.username);
        if (observed.state === "absent") {
          return recordConfigurationState(grant, employee.fullName, "github_managed_principal_unknown", "GitHub access needs configuration because the account that received this legacy managed grant cannot be established safely.", revision);
        }
        const rebound = await repository.updateGrantResult(businessId, grantId, {
          actualState: "pending",
          managedPrincipalExternalId: candidate.externalId,
          managedPrincipalUsername: candidate.username,
          desiredPrincipalExternalId: candidate.externalId,
          desiredPrincipalUsername: candidate.username,
        }, revision);
        if (!rebound) return { stale: true };
        grant = rebound;
      }

      const revokeManagedPrincipal = async () => {
        const principal = managedPrincipal();
        if (!principal) return { stale: false, changed: false };
        const result = await connector.ensureRevoked(target, principal.username, grant!.managedGrantCreated, grant!.baselinePermission);
        if (result.actualState === "failed") throw new GitHubApiError("github_verification_failed", "GitHub access revocation verification failed", true);
        const updated = await repository.updateGrantResult(businessId, grantId, {
          actualState: result.actualState,
          managedGrantCreated: false,
          managedPrincipalExternalId: null,
          managedPrincipalUsername: null,
          baselinePermission: null,
          lastVerifiedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        }, revision);
        if (!updated) return { stale: true, changed: result.changed };
        grant = updated;
        await auditResult(updated, employee.fullName, principal.username, result.actualState, executionAttemptId);
        return { stale: false, changed: result.changed };
      };

      let changed = false;
      if (managedPrincipal() && !samePrincipal(managedPrincipal(), desiredPrincipal())) {
        const revoked = await revokeManagedPrincipal();
        if (revoked.stale) return { stale: true };
        changed ||= revoked.changed;
      }

      if (grant.desiredState === "revoked") {
        if (managedPrincipal()) {
          const revoked = await revokeManagedPrincipal();
          if (revoked.stale) return { stale: true };
          changed ||= revoked.changed;
        }
        const state: ActualAccessState = grant.actualState === "retained_external" ? "retained_external" : "revoked";
        return { stale: false, changed, actualState: state };
      }

      const desired = desiredPrincipal();
      if (!desired) {
        return recordConfigurationState(grant, employee.fullName, "github_identity_missing", `GitHub access for ${employee.fullName} needs configuration because no GitHub identity is assigned.`, revision);
      }

      const currentManaged = managedPrincipal();
      let result;
      if (currentManaged && samePrincipal(currentManaged, desired)) {
        result = await connector.ensureGranted(target, desired.username, grant.managedGrantCreated, grant.baselinePermission);
      } else {
        const before = await connector.readActualState(target, desired.username);
        const alreadyDesired = target.resourceType === "team"
          ? before.state === "present" || before.state === "pending"
          : before.state === "present" && before.permission === target.permission;
        if (alreadyDesired) {
          result = {
            actualState: before.state === "pending" ? "pending_acceptance" as const : "granted" as const,
            changed: false,
            managedGrantCreated: false,
          };
        } else {
          const staged = await repository.updateGrantResult(businessId, grantId, {
            actualState: "pending",
            pendingPrincipalExternalId: desired.externalId,
            pendingPrincipalUsername: desired.username,
            pendingManagedGrantCreated: true,
            pendingBaselinePermission: before.permission ?? null,
          }, revision);
          if (!staged) return { stale: true };
          grant = staged;
          result = await connector.ensureGranted(target, desired.username, false, before.permission ?? null);
        }
      }
      if (result.actualState === "failed") throw new GitHubApiError("github_verification_failed", "GitHub access verification failed", true);
      const updated = await repository.updateGrantResult(businessId, grantId, {
        actualState: result.actualState,
        managedGrantCreated: result.managedGrantCreated,
        managedPrincipalExternalId: desired.externalId,
        managedPrincipalUsername: desired.username,
        pendingPrincipalExternalId: null,
        pendingPrincipalUsername: null,
        pendingManagedGrantCreated: false,
        pendingBaselinePermission: null,
        ...(result.baselinePermission !== undefined ? { baselinePermission: result.baselinePermission } : {}),
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      }, revision);
      if (!updated) {
        if (result.managedGrantCreated) await connector.ensureRevoked(target, desired.username, true, result.baselinePermission);
        return { stale: true };
      }
      await auditResult(updated, employee.fullName, desired.username, result.actualState, executionAttemptId);
      return { stale: false, changed: changed || result.changed, actualState: result.actualState };
    } catch (error) {
      const normalized =
        error instanceof GitHubApiError
          ? error
          : new GitHubApiError(
              "github_execution_failed",
              "GitHub access could not be reconciled",
              true,
            );
      const state: ActualAccessState = normalized.retryable
        ? "failed"
        : "blocked";
      const updated = await repository.updateGrantResult(businessId, grantId, {
        actualState: state,
        lastErrorCode: normalized.code,
        lastErrorMessage: normalized.message,
      }, revision);
      await auditResult(
        updated,
        employee.fullName,
        grant.managedPrincipalUsername ?? grant.desiredPrincipalUsername ?? grant.pendingPrincipalUsername ?? "unconfigured",
        state,
        executionAttemptId,
      );
      if (normalized.retryable) throw normalized;
      return { stale: false, changed: false, actualState: state };
    }
  };

  const getEmployeeState = async (businessId: string, employeeId: string) =>
    repository.listGrantsForEmployee(businessId, employeeId);
  return { enforceGrant, getEmployeeState, syncEmployeeDesiredAccess };
};

export type ExternalAccessReconciliationService = ReturnType<
  typeof createExternalAccessReconciliationService
>;
