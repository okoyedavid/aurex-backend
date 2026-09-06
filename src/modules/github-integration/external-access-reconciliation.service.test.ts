import { describe, expect, it, vi } from "vitest";
import { createExternalAccessReconciliationService } from "./external-access-reconciliation.service.js";
import { GitHubApiError } from "./github-client.js";

const businessId = "68b000000000000000000001";
const employeeId = "68b000000000000000000002";
const assignmentId = "68b000000000000000000003";
const policyId = "68b000000000000000000004";
const target = { provider: "github", resourceType: "team", organizationId: 10, organizationLogin: "acme", teamId: 20, teamSlug: "backend", role: "member" } as const;

const grant = (overrides: Record<string, unknown> = {}) => ({ id: "68b000000000000000000005", businessId, employeeId, assignmentId, policyId, policyVersion: 1, assignmentSource: "rule", provider: "github", resourceType: "team", resourceExternalId: "team:20", resourceDisplayName: "backend", target, desiredState: "granted", desiredRevision: 1, actualState: "pending", managedGrantCreated: false, managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka", desiredPrincipalExternalId: 77, desiredPrincipalUsername: "emeka", pendingPrincipalExternalId: null, pendingPrincipalUsername: null, pendingManagedGrantCreated: false, pendingBaselinePermission: null, baselinePermission: null, lastAuditState: null, ...overrides });

const setup = () => {
  const repository = {
    findActiveAssignmentsWithPolicies: vi.fn(), listGrantsForEmployee: vi.fn(), upsertDesiredGrant: vi.fn(), markDesiredRevoked: vi.fn(),
    findGrant: vi.fn(), findConnection: vi.fn(), findIdentity: vi.fn(), updateGrantResult: vi.fn(), claimGrantAuditState: vi.fn(),
  };
  repository.findIdentity.mockResolvedValue(null);
  repository.claimGrantAuditState.mockImplementation(async (_businessId, _grantId, desiredRevision, auditState, actualState) => grant({ desiredRevision, actualState, lastAuditState: auditState }));
  const employeeRepository = { findByIdAndBusiness: vi.fn() };
  const auditService = { recordEventSafely: vi.fn() };
  const client = { getTeamMembership: vi.fn(), putTeamMembership: vi.fn(), deleteTeamMembership: vi.fn() };
  const clientFactory = { forInstallation: vi.fn(() => client) };
  const service = createExternalAccessReconciliationService({ repository: repository as never, employeeRepository: employeeRepository as never, clientFactory: clientFactory as never, auditService: auditService as never });
  return { service, repository, employeeRepository, auditService, client };
};

const setupStateful = (initial: Record<string, unknown>, presentUsers: string[]) => {
  const fixture = setup();
  let current = grant(initial);
  const memberships = new Set(presentUsers);
  fixture.repository.findGrant.mockImplementation(async (requestedBusinessId) => requestedBusinessId === businessId ? current : null);
  fixture.repository.updateGrantResult.mockImplementation(async (requestedBusinessId, _grantId, updates, expectedRevision) => {
    if (requestedBusinessId !== businessId || (expectedRevision && current.desiredRevision !== expectedRevision)) return null;
    current = grant({ ...current, ...updates });
    return current;
  });
  fixture.repository.claimGrantAuditState.mockImplementation(async (requestedBusinessId, _grantId, desiredRevision, auditState, actualState) => {
    if (requestedBusinessId !== businessId || current.desiredRevision !== desiredRevision || current.lastAuditState === auditState) return null;
    current = grant({ ...current, actualState, lastAuditState: auditState });
    return current;
  });
  fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
  fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
  fixture.client.getTeamMembership.mockImplementation(async (_org, _team, username) => {
    if (!memberships.has(username)) throw new GitHubApiError("not_found", "not found", false, 404);
    return { state: "active", role: "member" };
  });
  fixture.client.putTeamMembership.mockImplementation(async (_org, _team, username) => {
    memberships.add(username);
    return { state: "active", role: "member" };
  });
  fixture.client.deleteTeamMembership.mockImplementation(async (_org, _team, username) => { memberships.delete(username); });
  return { ...fixture, memberships, current: () => current, setCurrent: (value: Record<string, unknown>) => { current = grant(value); } };
};

describe("ExternalAccessReconciliationService", () => {
  it("turns an effective GitHub policy assignment into a desired grant", async () => {
    const fixture = setup();
    fixture.repository.findActiveAssignmentsWithPolicies.mockResolvedValue([{ assignment: { id: assignmentId, policyId, policyVersion: 1, source: "rule" }, policy: { id: policyId, configuration: target } }]);
    fixture.repository.listGrantsForEmployee.mockResolvedValue([]);
    fixture.repository.upsertDesiredGrant.mockResolvedValue(grant());
    await expect(fixture.service.syncEmployeeDesiredAccess(businessId, employeeId)).resolves.toHaveLength(1);
    expect(fixture.repository.upsertDesiredGrant).toHaveBeenCalledWith(expect.objectContaining({ businessId, employeeId, assignmentId, resourceExternalId: "team:20" }));
  });

  it("turns a no-longer-effective assignment into a desired revoke", async () => {
    const fixture = setup();
    fixture.repository.findActiveAssignmentsWithPolicies.mockResolvedValue([]);
    fixture.repository.listGrantsForEmployee.mockResolvedValue([grant({ desiredState: "granted" })]);
    fixture.repository.markDesiredRevoked.mockResolvedValue(grant({ desiredState: "revoked", desiredRevision: 2 }));
    const result = await fixture.service.syncEmployeeDesiredAccess(businessId, employeeId);
    expect(result[0]).toMatchObject({ desiredState: "revoked", desiredRevision: 2 });
  });

  it("does not revoke a grant rebound to a replacement temporal assignment", async () => {
    const fixture = setup();
    const oldGrant = grant({ assignmentId: "old-assignment" });
    fixture.repository.findActiveAssignmentsWithPolicies.mockResolvedValue([{ assignment: { id: "new-assignment", policyId, policyVersion: 2, source: "rule" }, policy: { id: policyId, configuration: target } }]);
    fixture.repository.listGrantsForEmployee.mockResolvedValue([oldGrant]);
    fixture.repository.findIdentity.mockResolvedValue({ externalId: 77, username: "emeka" });
    fixture.repository.upsertDesiredGrant.mockResolvedValue(grant({ assignmentId: "new-assignment", policyVersion: 2 }));
    await fixture.service.syncEmployeeDesiredAccess(businessId, employeeId);
    expect(fixture.repository.markDesiredRevoked).not.toHaveBeenCalled();
  });

  it("uses needs_configuration without retrying when the employee has no GitHub identity", async () => {
    const fixture = setup();
    let current = grant({ managedGrantCreated: false, managedPrincipalExternalId: null, managedPrincipalUsername: null, desiredPrincipalExternalId: null, desiredPrincipalUsername: null });
    fixture.repository.findGrant.mockImplementation(async () => current);
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.repository.findIdentity.mockResolvedValue(null);
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => { current = grant({ ...current, ...updates }); return current; });
    await expect(fixture.service.enforceGrant(businessId, grant().id, 1)).resolves.toMatchObject({ actualState: "needs_configuration" });
    expect(fixture.auditService.recordEventSafely).toHaveBeenCalledWith(expect.objectContaining({ eventType: "github.access.blocked", summary: expect.stringContaining("no GitHub identity") }));
  });

  it("does not emit duplicate success audits for the same desired revision and state", async () => {
    const fixture = setup();
    fixture.repository.findGrant.mockResolvedValueOnce(grant()).mockResolvedValueOnce(grant({ actualState: "granted", lastAuditState: "1:granted:emeka" }));
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.repository.findIdentity.mockResolvedValue({ username: "emeka", externalId: 77 });
    fixture.client.getTeamMembership.mockResolvedValue({ state: "active", role: "member" });
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant(updates));
    await fixture.service.enforceGrant(businessId, grant().id, 1);
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant({ actualState: "granted", lastAuditState: "1:granted:emeka", ...updates }));
    await fixture.service.enforceGrant(businessId, grant().id, 1);
    expect(fixture.auditService.recordEventSafely).toHaveBeenCalledTimes(1);
  });

  it("throws retryable GitHub failures so BullMQ applies backoff", async () => {
    const fixture = setup();
    fixture.repository.findGrant.mockResolvedValue(grant());
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.repository.findIdentity.mockResolvedValue({ username: "emeka", externalId: 77 });
    fixture.client.getTeamMembership.mockRejectedValue(new GitHubApiError("github_network_error", "GitHub could not be reached", true));
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant(updates));
    await expect(fixture.service.enforceGrant(businessId, grant().id, 1)).rejects.toMatchObject({ code: "github_network_error", retryable: true });
  });

  it("revokes and verifies the old principal before granting and finalizing the new principal", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: true, managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka-old", desiredPrincipalExternalId: 88, desiredPrincipalUsername: "emeka-new" }, ["emeka-old"]);
    const result = await fixture.service.enforceGrant(businessId, grant().id, 2);
    expect(result).toMatchObject({ stale: false, actualState: "granted" });
    expect(fixture.memberships.has("emeka-old")).toBe(false);
    expect(fixture.memberships.has("emeka-new")).toBe(true);
    expect(fixture.client.deleteTeamMembership.mock.invocationCallOrder[0]).toBeLessThan(fixture.client.putTeamMembership.mock.invocationCallOrder[0]!);
    expect(fixture.current()).toMatchObject({ managedPrincipalExternalId: 88, managedPrincipalUsername: "emeka-new", managedGrantCreated: true });
    expect(fixture.auditService.recordEventSafely).toHaveBeenCalledTimes(2);
    expect(fixture.auditService.recordEventSafely).toHaveBeenNthCalledWith(1, expect.objectContaining({ eventType: "github.access.revoked", summary: expect.stringContaining("@emeka-old") }));
    expect(fixture.auditService.recordEventSafely).toHaveBeenNthCalledWith(2, expect.objectContaining({ eventType: "github.access.granted", summary: expect.stringContaining("@emeka-new") }));
  });

  it("revokes the retained managed principal when the employee identity is removed", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: true, managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka-old", desiredPrincipalExternalId: null, desiredPrincipalUsername: null }, ["emeka-old"]);
    await expect(fixture.service.enforceGrant(businessId, grant().id, 2)).resolves.toMatchObject({ actualState: "needs_configuration" });
    expect(fixture.memberships.has("emeka-old")).toBe(false);
    expect(fixture.current()).toMatchObject({ managedPrincipalExternalId: null, managedPrincipalUsername: null, actualState: "needs_configuration" });
  });

  it("does not revoke or regrant when only the username changed for the same GitHub user id", async () => {
    const fixture = setupStateful({ managedGrantCreated: true, managedPrincipalExternalId: 77, managedPrincipalUsername: "old-login", desiredPrincipalExternalId: 77, desiredPrincipalUsername: "new-login" }, ["new-login"]);
    await fixture.service.enforceGrant(businessId, grant().id, 1);
    expect(fixture.client.deleteTeamMembership).not.toHaveBeenCalled();
    expect(fixture.client.putTeamMembership).not.toHaveBeenCalled();
    expect(fixture.current()).toMatchObject({ managedPrincipalExternalId: 77, managedPrincipalUsername: "new-login" });
  });

  it("does not grant the new principal when revoking the old principal fails", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: true, managedPrincipalUsername: "emeka-old", desiredPrincipalExternalId: 88, desiredPrincipalUsername: "emeka-new" }, ["emeka-old"]);
    fixture.client.deleteTeamMembership.mockRejectedValueOnce(new GitHubApiError("github_permission_denied", "GitHub denied the removal", false));
    await expect(fixture.service.enforceGrant(businessId, grant().id, 2)).resolves.toMatchObject({ actualState: "blocked" });
    expect(fixture.client.putTeamMembership).not.toHaveBeenCalled();
    expect(fixture.current()).toMatchObject({ managedPrincipalUsername: "emeka-old", actualState: "blocked" });
  });

  it("continues safely when the old principal is already absent", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: true, managedPrincipalUsername: "emeka-old", desiredPrincipalExternalId: 88, desiredPrincipalUsername: "emeka-new" }, []);
    await fixture.service.enforceGrant(businessId, grant().id, 2);
    expect(fixture.memberships.has("emeka-new")).toBe(true);
    expect(fixture.current()).toMatchObject({ managedPrincipalUsername: "emeka-new", actualState: "granted" });
  });

  it("recovers an in-flight new-principal grant after a crash", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: false, managedPrincipalExternalId: null, managedPrincipalUsername: null, desiredPrincipalExternalId: 88, desiredPrincipalUsername: "emeka-new", pendingPrincipalExternalId: 88, pendingPrincipalUsername: "emeka-new", pendingManagedGrantCreated: true }, ["emeka-new"]);
    await fixture.service.enforceGrant(businessId, grant().id, 2);
    expect(fixture.memberships.has("emeka-new")).toBe(true);
    expect(fixture.current()).toMatchObject({ pendingPrincipalUsername: null, managedPrincipalUsername: "emeka-new", actualState: "granted" });
  });

  it("makes stale principal migrations no-ops before they can grant an obsolete identity", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: true, managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka-a", desiredPrincipalExternalId: 88, desiredPrincipalUsername: "emeka-b" }, ["emeka-a"]);
    fixture.client.deleteTeamMembership.mockImplementationOnce(async (_org, _team, username) => {
      fixture.memberships.delete(username);
      fixture.setCurrent({ ...fixture.current(), desiredRevision: 3, desiredPrincipalExternalId: 99, desiredPrincipalUsername: "emeka-c" });
    });
    await expect(fixture.service.enforceGrant(businessId, grant().id, 2)).resolves.toEqual({ stale: true });
    expect(fixture.client.putTeamMembership).not.toHaveBeenCalled();
    expect(fixture.memberships.has("emeka-b")).toBe(false);
  });

  it("preserves access that Aurex did not create during identity removal", async () => {
    const fixture = setupStateful({ desiredRevision: 2, managedGrantCreated: false, managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka-old", desiredPrincipalExternalId: null, desiredPrincipalUsername: null }, ["emeka-old"]);
    await fixture.service.enforceGrant(businessId, grant().id, 2);
    expect(fixture.client.deleteTeamMembership).not.toHaveBeenCalled();
    expect(fixture.memberships.has("emeka-old")).toBe(true);
  });

  it("does not expose a grant across business boundaries", async () => {
    const fixture = setupStateful({}, []);
    await expect(fixture.service.enforceGrant("68b000000000000000000099", grant().id, 1)).resolves.toEqual({ stale: true });
    expect(fixture.client.putTeamMembership).not.toHaveBeenCalled();
  });

  it("lazily binds a legacy grant only when the verified current principal has the managed access", async () => {
    const fixture = setupStateful({ managedGrantCreated: true, managedPrincipalExternalId: null, managedPrincipalUsername: null, desiredPrincipalExternalId: 77, desiredPrincipalUsername: "emeka" }, ["emeka"]);
    fixture.repository.findIdentity.mockResolvedValue({ externalId: 77, username: "emeka", verificationStatus: "verified" });
    await fixture.service.enforceGrant(businessId, grant().id, 1);
    expect(fixture.current()).toMatchObject({ managedPrincipalExternalId: 77, managedPrincipalUsername: "emeka", actualState: "granted" });
  });

  it("marks an unverifiable legacy managed principal as needing configuration", async () => {
    const fixture = setupStateful({ managedGrantCreated: true, managedPrincipalExternalId: null, managedPrincipalUsername: null, desiredPrincipalExternalId: 77, desiredPrincipalUsername: "emeka" }, []);
    fixture.repository.findIdentity.mockResolvedValue({ externalId: 77, username: "emeka", verificationStatus: "verified" });
    await expect(fixture.service.enforceGrant(businessId, grant().id, 1)).resolves.toMatchObject({ actualState: "needs_configuration" });
    expect(fixture.client.putTeamMembership).not.toHaveBeenCalled();
    expect(fixture.current()).toMatchObject({ lastErrorCode: "github_managed_principal_unknown" });
  });
});
