import type { HydratedDocument } from "mongoose";
import type { EmployeeGroupDocument } from "../employee-group/employee-group.model.js";
import type { EmployeeListDocument } from "../employee-list/employee-list.model.js";
import type { EmployeeTypeDocument } from "../employee-type/employee-type.model.js";
import { calculateTenureMonths } from "../policy-rule/rule-evaluator.js";
import type { EmployeeDocument } from "./employee.model.js";

export type EmployeeSource = HydratedDocument<EmployeeDocument>;
export type EmployeeListSource = HydratedDocument<EmployeeListDocument>;
export type EmployeeTypeSource = HydratedDocument<EmployeeTypeDocument>;
export type EmployeeGroupSource = HydratedDocument<EmployeeGroupDocument>;

export type EmployeeRelations = {
  departments: Map<string, EmployeeListSource>;
  employeeTypes: Map<string, EmployeeTypeSource>;
  groups: Map<string, EmployeeGroupSource>;
  managers: Map<string, EmployeeSource>;
};

const id = (value: unknown) => String(value);

export const maskAccountNumber = (accountNumber?: string | null) => {
  if (!accountNumber) return null;
  const visibleDigits = accountNumber.slice(-4);
  return `${"*".repeat(Math.max(0, accountNumber.length - 4))}${visibleDigits}`;
};

const safeAccountName = (
  accountName?: string | null,
  accountNumber?: string | null,
) => {
  if (!accountName) return null;
  if (!accountNumber || !accountName.includes(accountNumber)) return accountName;
  return accountName.replaceAll(accountNumber, maskAccountNumber(accountNumber)!);
};

const tenure = (employee: EmployeeSource, asOf: Date) =>
  employee.employmentStartDate
    ? calculateTenureMonths(employee.employmentStartDate, asOf)
    : null;

const basicRelations = (
  employee: EmployeeSource,
  relations: EmployeeRelations,
) => {
  const department = relations.departments.get(id(employee.employeeListId));
  const employeeType = employee.employeeTypeId
    ? relations.employeeTypes.get(id(employee.employeeTypeId))
    : null;
  const groups = (employee.groupIds ?? []).flatMap((groupId) => {
    const group = relations.groups.get(id(groupId));
    return group ? [{ id: group.id, name: group.name }] : [];
  });

  return {
    department: department
      ? { id: department.id, name: department.name }
      : null,
    employeeType: employeeType
      ? { id: employeeType.id, name: employeeType.name }
      : null,
    groups,
  };
};

export const mapEmployeeSummary = (
  employee: EmployeeSource,
  relations: EmployeeRelations,
  asOf = new Date(),
) => ({
  id: employee.id,
  fullName: employee.fullName,
  jobTitle: employee.jobTitle ?? null,
  ...basicRelations(employee, relations),
  state: employee.state ?? null,
  tenureMonths: tenure(employee, asOf),
  status: employee.status,
  accountLinked: Boolean(employee.businessMemberId),
  bank: {
    bankName: employee.bankName ?? null,
    maskedAccountNumber: maskAccountNumber(employee.accountNumber),
    verificationStatus: employee.accountVerificationStatus,
  },
});

export const mapEmployeeDetail = (
  employee: EmployeeSource,
  relations: EmployeeRelations,
  asOf = new Date(),
) => {
  const employeeType = employee.employeeTypeId
    ? relations.employeeTypes.get(id(employee.employeeTypeId))
    : null;
  const manager = employee.managerEmployeeId
    ? relations.managers.get(id(employee.managerEmployeeId))
    : null;
  const summaryRelations = basicRelations(employee, relations);

  return {
    id: employee.id,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle ?? null,
    status: employee.status,
    department: summaryRelations.department,
    employeeType: employeeType
      ? {
          id: employeeType.id,
          name: employeeType.name,
          description: employeeType.description ?? null,
          status: employeeType.status,
        }
      : null,
    groups: (employee.groupIds ?? []).flatMap((groupId) => {
      const group = relations.groups.get(id(groupId));
      return group
        ? [
            {
              id: group.id,
              name: group.name,
              description: group.description ?? null,
              status: group.status,
            },
          ]
        : [];
    }),
    manager: manager
      ? {
          id: manager.id,
          fullName: manager.fullName,
          jobTitle: manager.jobTitle ?? null,
        }
      : null,
    state: employee.state ?? null,
    employmentStartDate: employee.employmentStartDate ?? null,
    tenureMonths: tenure(employee, asOf),
    account: {
      linked: Boolean(employee.businessMemberId),
      ...(employee.businessMemberId
        ? { businessMemberId: id(employee.businessMemberId) }
        : {}),
    },
    payroll: {
      payFrequency: employee.payFrequency ?? null,
      amount: employee.amount,
      currency: employee.currency,
    },
    bankAccount: {
      bankName: employee.bankName ?? null,
      accountName: safeAccountName(
        employee.accountName,
        employee.accountNumber,
      ),
      maskedAccountNumber: maskAccountNumber(employee.accountNumber),
      verificationStatus: employee.accountVerificationStatus,
    },
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
};
