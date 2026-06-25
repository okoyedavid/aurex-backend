import { QueryFilter, QueryOptions } from "mongoose";
import { RepositoryOptions } from "../../repositories/repository-types.js";
import { Employee, EmployeeDocument } from "./employee.model.js";
import {
  CreateEmployeePayload,
  FindEmployeesFilters,
  UpdateEmployeePayload,
} from "./employee.types.js";

const createEmployee = (
  payload: CreateEmployeePayload,
  options: RepositoryOptions = {},
) =>
  Employee.create([payload], options).then(([employee]) => {
    if (!employee) {
      throw new Error("Failed to create employee");
    }

    return employee;
  });

const createEmployees = (
  payloads: CreateEmployeePayload[],
  options: RepositoryOptions = {},
) => Employee.create(payloads, options);

const findEmployeeById = (employeeId: string, options: QueryOptions = {}) =>
  Employee.findById(employeeId, null, options);

const findEmployeesByBusinessId = (
  businessId: string,
  filters: FindEmployeesFilters = {},
  options: QueryOptions = {},
) => {
  const query: QueryFilter<EmployeeDocument> = { businessId };

  if (filters.employeeListId) {
    query.employeeListId = filters.employeeListId;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.accountVerificationStatus) {
    query.accountVerificationStatus = filters.accountVerificationStatus;
  }

  if (filters.paymentStatus) {
    query.paymentStatus = filters.paymentStatus;
  }

  return Employee.find(query, null, options).sort({
    fullName: 1,
    createdAt: -1,
  });
};

const findEmployeesByEmployeeListId = (
  employeeListId: string,
  options: QueryOptions = {},
) =>
  Employee.find({ employeeListId }, null, options).sort({
    fullName: 1,
    createdAt: -1,
  });

const updateEmployeeById = (
  employeeId: string,
  payload: UpdateEmployeePayload,
  options: QueryOptions = {},
) =>
  Employee.findByIdAndUpdate(employeeId, payload, {
    new: true,
    ...options,
  });

const archiveEmployeeById = (
  employeeId: string,
  options: QueryOptions = {},
) =>
  updateEmployeeById(
    employeeId,
    {
      status: "archived",
    },
    options,
  );

const deleteEmployeeById = (
  employeeId: string,
  options: QueryOptions = {},
) => Employee.findByIdAndDelete(employeeId, options);

export const employeeRepository = {
  archiveEmployeeById,
  createEmployee,
  createEmployees,
  deleteEmployeeById,
  findEmployeeById,
  findEmployeesByBusinessId,
  findEmployeesByEmployeeListId,
  updateEmployeeById,
};

export type EmployeeRepository = typeof employeeRepository;
