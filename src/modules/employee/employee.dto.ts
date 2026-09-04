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
  linkedAccounts: Map<string, LinkedAccountProfile>;
};

export type LinkedAccountProfile = {
  businessMemberId: string;
  email: string;
  avatar: string | null;
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

const account = (employee: EmployeeSource, relations: EmployeeRelations) => {
  const businessMemberId = employee.businessMemberId
    ? id(employee.businessMemberId)
    : null;
  const linkedAccount = businessMemberId
    ? relations.linkedAccounts.get(businessMemberId)
    : null;

  return linkedAccount
    ? {
        linked: true as const,
        businessMemberId: linkedAccount.businessMemberId,
        email: linkedAccount.email,
        avatar: linkedAccount.avatar,
      }
    : { linked: false as const };
};

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
) => {
  const linkedAccount = account(employee, relations);

  return {
    id: employee.id,
    fullName: employee.fullName,
    jobTitle: employee.jobTitle ?? null,
    ...basicRelations(employee, relations),
    state: employee.state ?? null,
    tenureMonths: tenure(employee, asOf),
    status: employee.status,
    accountLinked: linkedAccount.linked,
    account: linkedAccount,
    bank: {
      bankName: employee.bankName ?? null,
      maskedAccountNumber: maskAccountNumber(employee.accountNumber),
      verificationStatus: employee.accountVerificationStatus,
    },
  };
};

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
  const managerAccount = manager
    ? account(manager, relations)
    : { linked: false as const };
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
          email: managerAccount.linked ? managerAccount.email : null,
          avatar: managerAccount.linked ? managerAccount.avatar : null,
        }
      : null,
    state: employee.state ?? null,
    employmentStartDate: employee.employmentStartDate ?? null,
    tenureMonths: tenure(employee, asOf),
    account: account(employee, relations),
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
