import { EmployeePolicyAssignment } from "../employee-policy-assignment/employee-policy-assignment.model.js";
import { Policy } from "../policy/policy.model.js";
import { EmployeeExternalIdentity } from "./employee-external-identity.model.js";
import { ExternalAccessGrant } from "./external-access-grant.model.js";
import { GitHubConnection } from "./github-connection.model.js";
import type { ActualAccessState, GitHubTarget } from "./github-integration.types.js";

const publicConnectionSelect = "-pendingStateHash -pendingStateExpiresAt";

const findConnection = (businessId: string, includePendingState = false) =>
  GitHubConnection.findOne({ businessId }).select(includePendingState ? "+pendingStateHash +pendingStateExpiresAt" : publicConnectionSelect);
const findConnectionByInstallation = (installationId: number) => GitHubConnection.findOne({ installationId }).select(publicConnectionSelect);
const savePendingConnection = (businessId: string, pendingStateHash: string, pendingStateExpiresAt: Date) =>
  GitHubConnection.findOneAndUpdate({ businessId }, { $set: { pendingStateHash, pendingStateExpiresAt } }, { upsert: true, returnDocument: "after", runValidators: true }).select(publicConnectionSelect);
const consumePendingState = (businessId: string, pendingStateHash: string) =>
  GitHubConnection.findOneAndUpdate(
    { businessId, pendingStateHash, pendingStateExpiresAt: { $gt: new Date() } },
    { $set: { pendingStateHash: null, pendingStateExpiresAt: null } },
    { returnDocument: "before" },
  ).select("+pendingStateHash +pendingStateExpiresAt");
const activateConnection = (businessId: string, installation: { id: number; account: { id: number; login: string; type: string }; repository_selection: string; suspended_at: string | null }) =>
  GitHubConnection.findOneAndUpdate({ businessId }, { $set: { installationId: installation.id, accountId: installation.account.id, accountLogin: installation.account.login, accountType: installation.account.type, repositorySelection: installation.repository_selection, status: installation.suspended_at ? "suspended" : "active", connectedAt: new Date(), pendingStateHash: null, pendingStateExpiresAt: null } }, { upsert: true, returnDocument: "after", runValidators: true }).select(publicConnectionSelect);
const disconnectConnection = (businessId: string) =>
  GitHubConnection.findOneAndUpdate({ businessId }, { $set: { status: "disconnected", installationId: null, pendingStateHash: null, pendingStateExpiresAt: null } }, { returnDocument: "after", runValidators: true }).select(publicConnectionSelect);
const markBusinessGrantsNeedsConfiguration = (businessId: string) => ExternalAccessGrant.updateMany({ businessId, provider: "github", managedByAurex: true }, { $set: { actualState: "needs_configuration", lastErrorCode: "github_connection_inactive", lastErrorMessage: "GitHub is disconnected for this business" } });

const findIdentity = (businessId: string, employeeId: string) => EmployeeExternalIdentity.findOne({ businessId, employeeId, provider: "github" });
const upsertIdentity = (businessId: string, employeeId: string, identity: { username: string; externalId: number | null; verificationStatus: "verified" | "unverified" }) =>
  EmployeeExternalIdentity.findOneAndUpdate({ businessId, employeeId, provider: "github" }, { $set: identity }, { upsert: true, returnDocument: "after", runValidators: true });
const deleteIdentity = (businessId: string, employeeId: string) => EmployeeExternalIdentity.findOneAndDelete({ businessId, employeeId, provider: "github" });

const findActiveAssignmentsWithPolicies = async (businessId: string, employeeId: string) => {
  const assignments = await EmployeePolicyAssignment.find({ businessId, employeeId, status: "active" });
  const policyIds = assignments.map((item) => item.policyId);
  const policies = await Policy.find({ businessId, _id: { $in: policyIds }, status: "active" });
  const byId = new Map(policies.map((item) => [item.id, item]));
  return assignments.flatMap((assignment) => {
    const policy = byId.get(String(assignment.policyId));
    return policy ? [{ assignment, policy }] : [];
  });
};

const listGrantsForEmployee = (businessId: string, employeeId: string) => ExternalAccessGrant.find({ businessId, employeeId, provider: "github", managedByAurex: true });
const findGrant = (businessId: string, grantId: string) => ExternalAccessGrant.findOne({ _id: grantId, businessId, provider: "github", managedByAurex: true });
const upsertDesiredGrant = async (input: { businessId: string; employeeId: string; assignmentId: string; policyId: string; policyVersion: number; assignmentSource: "rule" | "manual"; target: GitHubTarget; resourceExternalId: string; resourceDisplayName: string }) => {
  const filter = { businessId: input.businessId, assignmentId: input.assignmentId, resourceType: input.target.resourceType, resourceExternalId: input.resourceExternalId };
  const existing = await ExternalAccessGrant.findOne(filter);
  if (existing) {
    const changed = existing.desiredState !== "granted" || existing.policyVersion !== input.policyVersion || JSON.stringify(existing.target) !== JSON.stringify(input.target);
    return ExternalAccessGrant.findOneAndUpdate(filter, { $set: { employeeId: input.employeeId, policyId: input.policyId, policyVersion: input.policyVersion, assignmentSource: input.assignmentSource, target: input.target, resourceDisplayName: input.resourceDisplayName, desiredState: "granted", ...(changed ? { actualState: "pending", lastErrorCode: null, lastErrorMessage: null } : {}) }, ...(changed ? { $inc: { desiredRevision: 1 } } : {}) }, { returnDocument: "after", runValidators: true });
  }
  return ExternalAccessGrant.create({ ...input, provider: "github", resourceType: input.target.resourceType, desiredState: "granted", actualState: "pending", managedByAurex: true });
};
const markDesiredRevoked = (businessId: string, grantId: string) => ExternalAccessGrant.findOneAndUpdate({ _id: grantId, businessId, desiredState: { $ne: "revoked" } }, { $set: { desiredState: "revoked", actualState: "pending", lastErrorCode: null, lastErrorMessage: null }, $inc: { desiredRevision: 1 } }, { returnDocument: "after", runValidators: true });
const updateGrantResult = (businessId: string, grantId: string, updates: { actualState: ActualAccessState; managedGrantCreated?: boolean; baselinePermission?: string | null; lastAttemptAt?: Date; lastVerifiedAt?: Date | null; lastErrorCode?: string | null; lastErrorMessage?: string | null; lastAuditState?: string | null }) => ExternalAccessGrant.findOneAndUpdate({ _id: grantId, businessId }, { $set: updates }, { returnDocument: "after", runValidators: true });
const listManagedGrantsBatch = (businessId: string, afterId: string | null, limit: number) => ExternalAccessGrant.find({ businessId, provider: "github", managedByAurex: true, ...(afterId ? { _id: { $gt: afterId } } : {}) }).sort({ _id: 1 }).limit(limit);

export const githubIntegrationRepository = {
  activateConnection,
  consumePendingState,
  deleteIdentity,
  disconnectConnection,
  findActiveAssignmentsWithPolicies,
  findConnection,
  findConnectionByInstallation,
  findGrant,
  findIdentity,
  listGrantsForEmployee,
  listManagedGrantsBatch,
  markBusinessGrantsNeedsConfiguration,
  markDesiredRevoked,
  savePendingConnection,
  updateGrantResult,
  upsertDesiredGrant,
  upsertIdentity,
};
export type GitHubIntegrationRepository = typeof githubIntegrationRepository;
