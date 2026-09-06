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
    const [pairs, existing] = await Promise.all([
      repository.findActiveAssignmentsWithPolicies(businessId, employeeId),
      repository.listGrantsForEmployee(businessId, employeeId),
    ]);
    const desiredKeys = new Set<string>();
    const grants = [];
    for (const { assignment, policy } of pairs) {
      const target = githubTarget(policy.configuration);
      if (!target) continue;
      const resourceExternalId = githubResourceKey(target);
      desiredKeys.add(`${assignment.id}:${resourceExternalId}`);
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
      });
      if (grant) grants.push(grant);
    }
    for (const grant of existing) {
      if (desiredKeys.has(`${grant.assignmentId}:${grant.resourceExternalId}`))
        continue;
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
    if (!grant || grant.lastAuditState === `${grant.desiredRevision}:${state}`)
      return;
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
          ? `${employeeName} was added to the ${grant.resourceDisplayName} GitHub team.`
          : `GitHub repository access to ${grant.resourceDisplayName} was granted to ${employeeName}.`;
    } else if (state === "revoked") {
      eventType = "github.access.revoked";
      summary =
        target.resourceType === "team"
          ? `${employeeName} was removed from the ${grant.resourceDisplayName} GitHub team because the policy no longer applied.`
          : `Aurex-managed GitHub repository access to ${grant.resourceDisplayName} was removed from ${employeeName}.`;
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
    await repository.updateGrantResult(String(grant.businessId), grant.id, {
      actualState: state,
      lastAuditState: `${grant.desiredRevision}:${state}`,
    });
  };

  const recordConfigurationState = async (
    grant: NonNullable<
      Awaited<ReturnType<GitHubIntegrationRepository["findGrant"]>>
    >,
    employeeName: string,
    code: string,
    message: string,
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
    );
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
    const grant = await repository.findGrant(businessId, grantId);
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
    const identity = await repository.findIdentity(
      businessId,
      String(grant.employeeId),
    );
    if (!identity)
      return recordConfigurationState(
        grant,
        employee.fullName,
        "github_identity_missing",
        `GitHub access for ${employee.fullName} needs configuration because no GitHub identity is assigned.`,
      );
    const target = githubTarget(grant.target);
    if (!target)
      return recordConfigurationState(
        grant,
        employee.fullName,
        "github_target_invalid",
        "GitHub access needs configuration because the policy target is invalid.",
      );
    const executionAttemptId = crypto.randomUUID();
    await repository.updateGrantResult(businessId, grantId, {
      actualState: "pending",
      lastAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    try {
      const connector = new GitHubAccessConnector(
        clientFactory.forInstallation(connection.installationId),
      );
      const result =
        grant.desiredState === "granted"
          ? await connector.ensureGranted(
              target,
              identity.username,
              grant.managedGrantCreated,
              grant.baselinePermission,
            )
          : await connector.ensureRevoked(
              target,
              identity.username,
              grant.managedGrantCreated,
              grant.baselinePermission,
            );
      const updated = await repository.updateGrantResult(businessId, grantId, {
        actualState: result.actualState,
        managedGrantCreated: result.managedGrantCreated,
        ...(result.baselinePermission !== undefined
          ? { baselinePermission: result.baselinePermission }
          : {}),
        lastVerifiedAt: new Date(),
        lastErrorCode:
          result.actualState === "failed" ? "github_verification_failed" : null,
        lastErrorMessage:
          result.actualState === "failed"
            ? "GitHub did not reach the requested state after the access change"
            : null,
      });
      await auditResult(
        updated,
        employee.fullName,
        identity.username,
        result.actualState,
        executionAttemptId,
      );
      if (result.actualState === "failed")
        throw new GitHubApiError(
          "github_verification_failed",
          "GitHub access verification failed",
          true,
        );
      return {
        stale: false,
        changed: result.changed,
        actualState: result.actualState,
      };
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
      });
      await auditResult(
        updated,
        employee.fullName,
        identity.username,
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
