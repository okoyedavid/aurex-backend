import { QueryFilter, QueryOptions, UpdateQuery } from "mongoose";
import { RepositoryOptions } from "../../types/repository-types.js";
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

const paginateEmployeesByList = async ({
  businessId,
  employeeListId,
  page,
  limit,
}: {
  businessId: string;
  employeeListId: string;
  page: number;
  limit: number;
}) => {
  const query = {
    businessId,
    employeeListId,
    status: { $ne: "archived" as const },
  };
  const [items, total] = await Promise.all([
    Employee.find(query)
      .sort({ fullName: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Employee.countDocuments(query),
  ]);

  return { items, total };
};

const findEmployeeByBusinessListAndId = (
  businessId: string,
  employeeListId: string,
  employeeId: string,
) => Employee.findOne({ _id: employeeId, businessId, employeeListId });

const updateEmployeeById = (
  employeeId: string,
  payload: UpdateEmployeePayload,
  options: QueryOptions = {},
) =>
  Employee.findByIdAndUpdate(employeeId, payload, {
    returnDocument: "after",
    ...options,
  });

const claimNextVerification = () => {
  const now = new Date();

  return Employee.findOneAndUpdate(
    {
      verificationJobStatus: { $in: ["pending", "retrying"] },
      $or: [
        { nextVerificationAttemptAt: null },
        { nextVerificationAttemptAt: { $exists: false } },
        { nextVerificationAttemptAt: { $lte: now } },
      ],
    },
    {
      $set: { verificationJobStatus: "processing" },
      $inc: { verificationAttemptCount: 1 },
    },
    { returnDocument: "after", sort: { createdAt: 1 } },
  );
};

const updateVerificationResult = (
  employeeId: string,
  payload: UpdateQuery<EmployeeDocument>,
) =>
  Employee.findByIdAndUpdate(employeeId, payload, {
    returnDocument: "after",
  });

const countVerificationStatesByEmployeeListId = async (
  employeeListId: string,
) => {
  const [total, pending, processing, retrying, verified, invalid, exhausted] =
    await Promise.all([
      Employee.countDocuments({ employeeListId }),
      Employee.countDocuments({
        employeeListId,
        verificationJobStatus: "pending",
      }),
      Employee.countDocuments({
        employeeListId,
        verificationJobStatus: "processing",
      }),
      Employee.countDocuments({
        employeeListId,
        verificationJobStatus: "retrying",
      }),
      Employee.countDocuments({
        employeeListId,
        accountVerificationStatus: "verified",
      }),
      Employee.countDocuments({
        employeeListId,
        accountVerificationStatus: "failed",
      }),
      Employee.countDocuments({
        employeeListId,
        verificationJobStatus: "exhausted",
      }),
    ]);

  return { total, pending, processing, retrying, verified, invalid, exhausted };
};

const archiveEmployeeById = (employeeId: string, options: QueryOptions = {}) =>
  updateEmployeeById(
    employeeId,
    {
      status: "archived",
    },
    options,
  );

const deleteEmployeeById = (employeeId: string, options: QueryOptions = {}) =>
  Employee.findByIdAndDelete(employeeId, options);

export const employeeRepository = {
  archiveEmployeeById,
  claimNextVerification,
  countVerificationStatesByEmployeeListId,
  createEmployee,
  createEmployees,
  deleteEmployeeById,
  findEmployeeById,
  findEmployeeByBusinessListAndId,
  findEmployeesByBusinessId,
  findEmployeesByEmployeeListId,
  paginateEmployeesByList,
  updateEmployeeById,
  updateVerificationResult,
};

export type EmployeeRepository = typeof employeeRepository;
