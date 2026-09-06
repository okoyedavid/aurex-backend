import { describe, expect, it, vi } from "vitest";
import { createAuditFeedService } from "./audit-feed.service.js";
import { mapGeneralAuditEvent, mapPolicyAuditEvent } from "./audit-feed.dto.js";

const businessId = "68b000000000000000000001";
const userId = "68b000000000000000000002";
const memberId = "68b000000000000000000003";
const employeeId = "68b000000000000000000004";
const policyId = "68b000000000000000000005";
const categoryId = "68b000000000000000000006";

const general = (overrides: Record<string, unknown> = {}) => ({
  id: "general-1",
  eventType: "business.member.role_updated",
  category: "business",
  actorBusinessMemberId: { id: memberId, userId: { name: "Ada Admin" } },
  subjectBusinessMemberId: { id: memberId, userId: { name: "Maya Member" } },
  subjectType: "member",
  createdAt: new Date("2026-01-02"),
  ...overrides,
});

const policy = (overrides: Record<string, unknown> = {}) => ({
  id: "policy-audit-1",
  action: "ASSIGNMENT_CREATED",
  actorType: "worker",
  actorSnapshot: { id: null, type: "worker", displayName: "Aurex policy engine" },
  employeeId: { id: employeeId, fullName: "Current Employee Name" },
  employeeSnapshot: { id: employeeId, displayName: "Maya Employee" },
  policyId: { id: policyId, name: "Renamed Policy", description: "Current description", version: 3 },
  policySnapshot: { id: policyId, displayName: "Remote Work", description: "Original description", version: 1 },
  categoryId: { id: categoryId, name: "Renamed Category", description: "Current category", cardinality: "ONE" },
  categorySnapshot: { id: categoryId, displayName: "Work Location", description: "Original category", cardinality: "MANY" },
  occurredAt: new Date("2026-01-03"),
  metadata: { token: "secret" },
  before: { configuration: { secret: true } },
  after: { configuration: { secret: true } },
  changedFields: ["configuration"],
  ...overrides,
});

const setup = (permissions: string[] = []) => {
  const auditEventRepository = {
    listBusinessAuditEvents: vi.fn(async () => [general()]),
    countBusinessAuditEvents: vi.fn(async () => 1),
    listPersonalAuditEvents: vi.fn(async () => [general()]),
    countPersonalAuditEvents: vi.fn(async () => 1),
  };
  const policyAuditRepository = {
    listAudits: vi.fn(async () => ({ items: [policy()], total: 1 })),
    listPersonalAudits: vi.fn(async () => [policy()]),
    countPersonalAudits: vi.fn(async () => 1),
  };
  const businessMemberRepository = {
    findActiveMembershipByBusinessAndUser: vi.fn(async (requestedBusinessId: string) =>
      requestedBusinessId === businessId
        ? { id: memberId, roleId: { permissions, deniedPermissions: [] } }
        : null),
  };
  const employeeRepository = {
    findByBusinessMember: vi.fn(async (requestedBusinessId: string, requestedMemberId: string) =>
      requestedBusinessId === businessId && requestedMemberId === memberId ? { id: employeeId } : null),
  };
  const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
  const service = createAuditFeedService({
    auditEventRepository: auditEventRepository as never,
    policyAuditRepository: policyAuditRepository as never,
    businessMemberRepository: businessMemberRepository as never,
    employeeRepository: employeeRepository as never,
    createHttpError,
  });
  return { service, auditEventRepository, policyAuditRepository, businessMemberRepository, employeeRepository };
};

describe("audit feed authorization", () => {
  it("rejects business audit without audit_logs:view", async () => {
    const { service } = setup();
    await expect(service.listBusinessAudit({ businessId, userId, page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows general business audit with audit_logs:view", async () => {
    const result = await setup(["audit_logs:view"]).service.listBusinessAudit({ businessId, userId, page: 1, limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.domain).toBe("member");
  });

  it("does not expose PolicyAudit with audit_logs:view alone", async () => {
    const { service, policyAuditRepository } = setup(["audit_logs:view"]);
    const result = await service.listBusinessAudit({ businessId, userId, page: 1, limit: 20 });
    expect(result.items.every((item) => item.domain !== "policy")).toBe(true);
    expect(policyAuditRepository.listAudits).not.toHaveBeenCalled();
  });

  it("includes policy audit only when both permissions exist", async () => {
    const result = await setup(["audit_logs:view", "policies:view_audit"]).service.listBusinessAudit({ businessId, userId, page: 1, limit: 20 });
    expect(result.items.some((item) => item.domain === "policy")).toBe(true);
  });

  it("cannot use domain=policy to bypass policy authorization", async () => {
    const { service, policyAuditRepository } = setup(["audit_logs:view"]);
    const result = await service.listBusinessAudit({ businessId, userId, page: 1, limit: 20, domain: "policy" });
    expect(result.items).toEqual([]);
    expect(policyAuditRepository.listAudits).not.toHaveBeenCalled();
  });

  it("honors explicit role denials", async () => {
    const fixture = setup(["audit_logs:view"]);
    fixture.businessMemberRepository.findActiveMembershipByBusinessAndUser.mockResolvedValue({ id: memberId, roleId: { permissions: ["audit_logs:view"], deniedPermissions: ["audit_logs:view"] } });
    await expect(fixture.service.listBusinessAudit({ businessId, userId, page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("enforces business isolation through membership lookup", async () => {
    const { service } = setup(["audit_logs:view"]);
    await expect(service.listBusinessAudit({ businessId: "68b000000000000000000099", userId, page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("passes safe filters into authorized repository queries", async () => {
    const { service, auditEventRepository } = setup(["audit_logs:view"]);
    await service.listBusinessAudit({ businessId, userId, page: 1, limit: 20, domain: "employee", employeeId, action: "business.employee.updated" });
    expect(auditEventRepository.listBusinessAuditEvents).toHaveBeenCalledWith(businessId, expect.objectContaining({ domain: "employee", employeeId, action: "business.employee.updated" }), 20);
  });

  it("paginates the merged authorized result", async () => {
    const { service } = setup(["audit_logs:view", "policies:view_audit"]);
    const result = await service.listBusinessAudit({ businessId, userId, page: 2, limit: 1 });
    expect(result.pagination).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(result.items).toHaveLength(1);
  });
});

describe("personal audit visibility", () => {
  it("allows an active member without audit permissions", async () => {
    const result = await setup().service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 });
    expect(result.items).toHaveLength(2);
  });

  it("queries explicit current member identity", async () => {
    const { service, auditEventRepository } = setup();
    await service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 });
    expect(auditEventRepository.listPersonalAuditEvents).toHaveBeenCalledWith(businessId, memberId, employeeId, 20);
  });

  it("queries only the employee linked to the current member", async () => {
    const { service, policyAuditRepository } = setup();
    await service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 });
    expect(policyAuditRepository.listPersonalAudits).toHaveBeenCalledWith(businessId, employeeId, 20);
  });

  it("uses the assignment-only personal policy repository path", async () => {
    const { service, policyAuditRepository } = setup();
    await service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 });
    expect(policyAuditRepository.listAudits).not.toHaveBeenCalled();
  });

  it("does not query policy audit when the member has no linked employee", async () => {
    const fixture = setup();
    fixture.employeeRepository.findByBusinessMember.mockResolvedValue(null);
    await fixture.service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 });
    expect(fixture.policyAuditRepository.listPersonalAudits).not.toHaveBeenCalled();
  });

  it("rejects a user who is not an active member", async () => {
    const fixture = setup();
    fixture.businessMemberRepository.findActiveMembershipByBusinessAndUser.mockResolvedValue(null);
    await expect(fixture.service.listPersonalAudit({ businessId, userId, page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("safe audit DTO", () => {
  it("preserves actor and subject as separate identities", () => {
    const dto = mapGeneralAuditEvent(general());
    expect(dto.actor?.displayName).toBe("Ada Admin");
    expect(dto.subject?.displayName).toBe("Maya Member");
  });

  it("removes sensitive general change fields", () => {
    const dto = mapGeneralAuditEvent(general({ changes: { fields: ["status", "accountNumber", "password"], before: { status: "active", accountNumber: "123", password: "x" }, after: { status: "suspended", accountNumber: "456", password: "y" } } }));
    expect(JSON.stringify(dto)).not.toMatch(/123|456|password|accountNumber/);
    expect(dto.changes).toEqual([{ field: "status", before: "active", after: "suspended" }]);
  });

  it("sanitizes personal policy effects", () => {
    const dto = mapPolicyAuditEvent(policy(), true);
    expect(dto.summary).toBe("Remote Work was assigned to you.");
    expect(dto.policy).toEqual({ id: policyId, version: 1, displayName: "Remote Work", description: "Original description" });
    expect(dto.category).toEqual({ id: categoryId, displayName: "Work Location", description: "Original category", cardinality: "MANY" });
    expect(dto.historicalSnapshotAvailable).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(/configuration|secret|metadata|token/);
  });

  it("does not expose policy configuration changes in an administrative DTO", () => {
    const dto = mapPolicyAuditEvent(policy(), false);
    expect(dto.subject).toEqual({ type: "employee", id: employeeId, displayName: "Maya Employee" });
    expect(dto.summary).toBe("Remote Work was assigned to Maya Employee.");
    expect(JSON.stringify(dto)).not.toMatch(/configuration|secret|metadata|token/);
  });

  it("marks legacy live-name fallbacks as historically unreliable", () => {
    const dto = mapPolicyAuditEvent(policy({ policySnapshot: undefined, categorySnapshot: undefined, employeeSnapshot: undefined }), false);
    expect(dto.policy?.displayName).toBe("Renamed Policy");
    expect(dto.category?.displayName).toBe("Renamed Category");
    expect(dto.historicalSnapshotAvailable).toBe(false);
  });
});
