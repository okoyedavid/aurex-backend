import { describe, expect, it, vi } from "vitest";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import { createEmployeeService } from "./employee.service.js";
import type { EmployeeRepository } from "./employee.repository.js";
import type { EmployeeSource } from "./employee.dto.js";
import { escapeEmployeeSearch } from "./employee.repository.js";

const businessId = "68b000000000000000000001";
const otherBusinessId = "68b000000000000000000099";
const employeeId = "68b000000000000000000002";
const listId = "68b000000000000000000003";
const typeId = "68b000000000000000000004";
const groupId = "68b000000000000000000005";
const managerId = "68b000000000000000000006";

const employee = (overrides: Record<string, unknown> = {}) =>
  ({
    id: employeeId,
    businessId,
    employeeListId: listId,
    employeeTypeId: typeId,
    groupIds: [groupId],
    managerEmployeeId: managerId,
    businessMemberId: null,
    fullName: "Maya Patel",
    jobTitle: "Software Engineer",
    state: "California",
    employmentStartDate: new Date("2024-01-01"),
    status: "active",
    bankName: "Demo Bank",
    accountNumber: "1234567890",
    accountName: "Maya Patel",
    accountVerificationStatus: "verified",
    verificationJobStatus: "completed",
    amount: 1000,
    currency: "USD",
    payFrequency: "monthly",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }) as unknown as EmployeeSource;

const setup = () => {
  let storedEmployee = employee();
  const employeeRepository = {
    findByIdAndBusiness: vi.fn(async (id: string, requestedBusinessId: string) => id === employeeId && requestedBusinessId === businessId ? storedEmployee : id === managerId && requestedBusinessId === businessId ? employee({ id: managerId, fullName: "Sarah Chen", jobTitle: "VP Engineering", managerEmployeeId: null }) : null),
    findByIdsAndBusiness: vi.fn(async () => [employee({ id: managerId, fullName: "Sarah Chen", jobTitle: "VP Engineering", managerEmployeeId: null })]),
    paginateEmployeesByBusiness: vi.fn(async ({ businessId: requestedBusinessId }: { businessId: string }) => ({ items: requestedBusinessId === businessId ? [storedEmployee] : [], total: requestedBusinessId === businessId ? 1 : 0 })),
    updateEmployeeByBusinessAndId: vi.fn(async (_businessId: string, _employeeId: string, updates: Record<string, unknown>) => { storedEmployee = employee({ ...storedEmployee, ...updates }); return storedEmployee; }),
    updateVerificationResultByBusiness: vi.fn(),
    countVerificationStatesByEmployeeListId: vi.fn(async () => ({ total: 1, pending: 0, processing: 0, retrying: 0, verified: 1, invalid: 0, exhausted: 0 })),
  };
  const employeeListRepository = {
    findEmployeeListsByBusinessAndIds: vi.fn(async () => [{ id: listId, name: "Engineering" }]),
    findEmployeeListByBusinessAndId: vi.fn(async (_businessId: string, id: string) => id === listId ? { id: listId, businessId, name: "Engineering" } : null),
    updateEmployeeListById: vi.fn(),
  };
  const employeeTypeRepository = {
    findByBusinessAndIds: vi.fn(async () => [{ id: typeId, name: "Full Time", description: "Permanent", status: "active" }]),
    findActiveByBusinessAndId: vi.fn(async () => ({ id: typeId, businessId, status: "active" })),
  };
  const employeeGroupRepository = {
    findByBusinessAndIds: vi.fn(async () => [{ id: groupId, name: "Remote", description: "Remote staff", status: "active" }]),
    findActiveByBusinessAndIds: vi.fn(async () => [{ id: groupId }]),
  };
  const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
  const auditEventService = { recordEventSafely: vi.fn() };
  const service = createEmployeeService({
    employeeRepository: employeeRepository as unknown as EmployeeRepository,
    employeeListRepository: employeeListRepository as unknown as EmployeeListRepository,
    employeeTypeRepository: employeeTypeRepository as unknown as EmployeeTypeRepository,
    employeeGroupRepository: employeeGroupRepository as unknown as EmployeeGroupRepository,
    auditEventService: auditEventService as never,
    businessMemberRepository: { findActiveMembershipByBusinessAndUser: vi.fn(async () => null) } as never,
    withTransaction: vi.fn() as never,
    createHttpError,
  });
  return { service, employeeRepository, employeeListRepository, auditEventService };
};

describe("business-scoped employee service", () => {
  it("lists only the requested business", async () => { const { service } = setup(); expect((await service.listBusinessEmployees({ businessId, page: 1, limit: 20 })).items).toHaveLength(1); expect((await service.listBusinessEmployees({ businessId: otherBusinessId, page: 1, limit: 20 })).items).toHaveLength(0); });
  it("passes search and every supported filter to the repository", async () => { const { service, employeeRepository } = setup(); await service.listBusinessEmployees({ businessId, page: 2, limit: 10, search: "maya", employeeListId: listId, employeeTypeId: typeId, groupId, state: "California", status: "active" }); expect(employeeRepository.paginateEmployeesByBusiness).toHaveBeenCalledWith({ businessId, page: 2, limit: 10, filters: { search: "maya", employeeListId: listId, employeeTypeId: typeId, groupId, state: "California", status: "active" } }); });
  it("returns complete pagination navigation fields", async () => { const { service } = setup(); const result = await service.listBusinessEmployees({ businessId, page: 1, limit: 1 }); expect(result.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false }); });
  it("returns human-readable relations from batched lookups", async () => { const { service } = setup(); expect((await service.listBusinessEmployees({ businessId, page: 1, limit: 20 })).items[0]).toMatchObject({ fullName: "Maya Patel", department: { name: "Engineering" }, employeeType: { name: "Full Time" }, groups: [{ name: "Remote" }] }); });
  it("returns a canonical profile with manager and tenure", async () => { const { service } = setup(); const result = await service.getEmployeeProfile({ businessId, employeeId }); expect(result.employee).toMatchObject({ manager: { fullName: "Sarah Chen" }, department: { name: "Engineering" }, tenureMonths: expect.any(Number) }); });
  it("returns 404 for an employee from another business", async () => { const { service } = setup(); await expect(service.getEmployeeProfile({ businessId: otherBusinessId, employeeId })).rejects.toMatchObject({ statusCode: 404 }); });
  it("preserves old list-scoped detail behavior", async () => { const { service } = setup(); expect((await service.getEmployee({ businessId, employeeListId: listId, employeeId })).employee.fullName).toBe("Maya Patel"); });
  it("rejects the old detail route when the list does not match", async () => { const { service } = setup(); await expect(service.getEmployee({ businessId, employeeListId: otherBusinessId, employeeId })).rejects.toMatchObject({ statusCode: 404 }); });
  it("supports canonical PATCH through the shared update path", async () => { const { service, employeeRepository } = setup(); const result = await service.updateBusinessEmployee({ businessId, employeeId, updates: { jobTitle: "Senior Engineer" } }); expect(employeeRepository.updateEmployeeByBusinessAndId).toHaveBeenCalledWith(businessId, employeeId, { jobTitle: "Senior Engineer" }); expect(result.employee.jobTitle).toBe("Senior Engineer"); });
  it("does not write or audit a no-op update", async () => { const { service, employeeRepository, auditEventService } = setup(); await service.updateBusinessEmployee({ businessId, employeeId, updates: { jobTitle: "Software Engineer" } }); expect(employeeRepository.updateEmployeeByBusinessAndId).not.toHaveBeenCalled(); expect(auditEventService.recordEventSafely).not.toHaveBeenCalled(); });
  it("prevents a self-manager relationship", async () => { const { service } = setup(); await expect(service.updateBusinessEmployee({ businessId, employeeId, updates: { managerEmployeeId: employeeId } })).rejects.toMatchObject({ statusCode: 400 }); });
  it("prevents a manager from another business", async () => { const { service } = setup(); await expect(service.updateBusinessEmployee({ businessId, employeeId, updates: { managerEmployeeId: otherBusinessId } })).rejects.toMatchObject({ statusCode: 400 }); });
  it("escapes regex metacharacters in employee search", () => expect(escapeEmployeeSearch("Maya.*(Admin)")).toBe("Maya\\.\\*\\(Admin\\)"));
});
