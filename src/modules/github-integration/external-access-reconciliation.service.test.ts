import { describe, expect, it, vi } from "vitest";
import { createExternalAccessReconciliationService } from "./external-access-reconciliation.service.js";
import { GitHubApiError } from "./github-client.js";

const businessId = "68b000000000000000000001";
const employeeId = "68b000000000000000000002";
const assignmentId = "68b000000000000000000003";
const policyId = "68b000000000000000000004";
const target = { provider: "github", resourceType: "team", organizationId: 10, organizationLogin: "acme", teamId: 20, teamSlug: "backend", role: "member" } as const;

const grant = (overrides: Record<string, unknown> = {}) => ({ id: "68b000000000000000000005", businessId, employeeId, assignmentId, policyId, policyVersion: 1, assignmentSource: "rule", provider: "github", resourceType: "team", resourceExternalId: "team:20", resourceDisplayName: "backend", target, desiredState: "granted", desiredRevision: 1, actualState: "pending", managedGrantCreated: false, lastAuditState: null, ...overrides });

const setup = () => {
  const repository = {
    findActiveAssignmentsWithPolicies: vi.fn(), listGrantsForEmployee: vi.fn(), upsertDesiredGrant: vi.fn(), markDesiredRevoked: vi.fn(),
    findGrant: vi.fn(), findConnection: vi.fn(), findIdentity: vi.fn(), updateGrantResult: vi.fn(),
  };
  const employeeRepository = { findByIdAndBusiness: vi.fn() };
  const auditService = { recordEventSafely: vi.fn() };
  const client = { getTeamMembership: vi.fn(), putTeamMembership: vi.fn(), deleteTeamMembership: vi.fn() };
  const clientFactory = { forInstallation: vi.fn(() => client) };
  const service = createExternalAccessReconciliationService({ repository: repository as never, employeeRepository: employeeRepository as never, clientFactory: clientFactory as never, auditService: auditService as never });
  return { service, repository, employeeRepository, auditService, client };
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

  it("uses needs_configuration without retrying when the employee has no GitHub identity", async () => {
    const fixture = setup();
    fixture.repository.findGrant.mockResolvedValue(grant());
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.repository.findIdentity.mockResolvedValue(null);
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant(updates));
    await expect(fixture.service.enforceGrant(businessId, grant().id, 1)).resolves.toMatchObject({ actualState: "needs_configuration" });
    expect(fixture.auditService.recordEventSafely).toHaveBeenCalledWith(expect.objectContaining({ eventType: "github.access.blocked", summary: expect.stringContaining("no GitHub identity") }));
  });

  it("does not emit duplicate success audits for the same desired revision and state", async () => {
    const fixture = setup();
    fixture.repository.findGrant.mockResolvedValueOnce(grant()).mockResolvedValueOnce(grant({ actualState: "granted", lastAuditState: "1:granted" }));
    fixture.employeeRepository.findByIdAndBusiness.mockResolvedValue({ id: employeeId, fullName: "Emeka Okoye" });
    fixture.repository.findConnection.mockResolvedValue({ status: "active", installationId: 42 });
    fixture.repository.findIdentity.mockResolvedValue({ username: "emeka", externalId: 77 });
    fixture.client.getTeamMembership.mockResolvedValue({ state: "active", role: "member" });
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant(updates));
    await fixture.service.enforceGrant(businessId, grant().id, 1);
    fixture.repository.updateGrantResult.mockImplementation(async (_businessId, _grantId, updates) => grant({ actualState: "granted", lastAuditState: "1:granted", ...updates }));
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
});
