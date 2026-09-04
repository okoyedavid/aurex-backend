import { describe, expect, it } from "vitest";
import {
  mapEmployeeDetail,
  mapEmployeeSummary,
  maskAccountNumber,
  type EmployeeGroupSource,
  type EmployeeListSource,
  type EmployeeRelations,
  type EmployeeSource,
  type EmployeeTypeSource,
} from "./employee.dto.js";

const employee = (overrides: Partial<EmployeeSource> = {}) =>
  ({
    id: "employee-1",
    fullName: "Sarah Chen",
    jobTitle: "VP Engineering",
    status: "active",
    businessMemberId: "member-1",
    employeeListId: "department-1",
    employeeTypeId: "type-1",
    managerEmployeeId: "manager-1",
    groupIds: ["group-1"],
    employmentStartDate: new Date("2020-01-15T00:00:00.000Z"),
    state: "California",
    bankName: "Demo Bank",
    accountName: "TEST ACCOUNT 1234567890",
    accountNumber: "1234567890",
    accountVerificationStatus: "verified",
    payFrequency: "monthly",
    amount: 1000,
    currency: "USD",
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }) as unknown as EmployeeSource;

const relations = (): EmployeeRelations => ({
  departments: new Map([
    ["department-1", { id: "department-1", name: "Engineering" } as EmployeeListSource],
  ]),
  employeeTypes: new Map([
    ["type-1", { id: "type-1", name: "Full Time", description: "Permanent", status: "active" } as EmployeeTypeSource],
  ]),
  groups: new Map([
    ["group-1", { id: "group-1", name: "Executive", description: "Leadership", status: "active" } as EmployeeGroupSource],
  ]),
  managers: new Map([
    ["manager-1", employee({ id: "manager-1", fullName: "Alex Morgan", jobTitle: "CEO", businessMemberId: "manager-member-1", managerEmployeeId: null })],
  ]),
  linkedAccounts: new Map([
    ["member-1", { businessMemberId: "member-1", email: "sarah@example.com", avatar: "https://example.com/sarah.jpg" }],
    ["manager-member-1", { businessMemberId: "manager-member-1", email: "alex@example.com", avatar: "https://example.com/alex.jpg" }],
  ]),
});

describe("employee DTO safety and relation mapping", () => {
  it("masks a ten-digit account number", () => expect(maskAccountNumber("1234567890")).toBe("******7890"));
  it("returns null when there is no account number", () => expect(maskAccountNumber(null)).toBeNull());
  it("maps department, type, and group names in summaries", () => expect(mapEmployeeSummary(employee(), relations())).toMatchObject({ department: { name: "Engineering" }, employeeType: { name: "Full Time" }, groups: [{ name: "Executive" }] }));
  it("does not expose a full account number in summaries", () => { const json = JSON.stringify(mapEmployeeSummary(employee(), relations())); expect(json).not.toContain("1234567890"); expect(json).toContain("******7890"); });
  it("does not expose payroll amounts in summaries", () => expect(mapEmployeeSummary(employee(), relations())).not.toHaveProperty("payroll"));
  it("resolves a lightweight non-recursive manager with linked account details", () => expect(mapEmployeeDetail(employee(), relations()).manager).toEqual({ id: "manager-1", fullName: "Alex Morgan", jobTitle: "CEO", email: "alex@example.com", avatar: "https://example.com/alex.jpg" }));
  it("returns null account details for a manager without a linked account", () => { const value = relations(); value.linkedAccounts.delete("manager-member-1"); expect(mapEmployeeDetail(employee(), value).manager).toMatchObject({ email: null, avatar: null }); });
  it("includes descriptive relation fields in detail", () => expect(mapEmployeeDetail(employee(), relations())).toMatchObject({ employeeType: { description: "Permanent", status: "active" }, groups: [{ description: "Leadership", status: "active" }] }));
  it("calculates tenure relative to the supplied date", () => expect(mapEmployeeDetail(employee(), relations(), new Date("2026-01-15T00:00:00.000Z")).tenureMonths).toBe(72));
  it("returns null tenure when employmentStartDate is missing", () => expect(mapEmployeeDetail(employee({ employmentStartDate: undefined }), relations()).tenureMonths).toBeNull());
  it("redacts an account number embedded in accountName", () => expect(mapEmployeeDetail(employee(), relations()).bankAccount.accountName).toBe("TEST ACCOUNT ******7890"));
  it("never returns the raw accountNumber property", () => expect(mapEmployeeDetail(employee(), relations()).bankAccount).not.toHaveProperty("accountNumber"));
  it("returns a safe linked account profile", () => expect(mapEmployeeDetail(employee(), relations()).account).toEqual({ linked: true, businessMemberId: "member-1", email: "sarah@example.com", avatar: "https://example.com/sarah.jpg" }));
  it("includes the safe linked account profile in summaries", () => expect(mapEmployeeSummary(employee(), relations())).toMatchObject({ accountLinked: true, account: { linked: true, email: "sarah@example.com", avatar: "https://example.com/sarah.jpg" } }));
  it("returns an unlinked account when the account reference cannot be resolved", () => expect(mapEmployeeDetail(employee(), { departments: new Map(), employeeTypes: new Map(), groups: new Map(), managers: new Map(), linkedAccounts: new Map() })).toMatchObject({ department: null, employeeType: null, groups: [], manager: null, account: { linked: false } }));
});
