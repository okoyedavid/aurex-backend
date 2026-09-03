import { QueryFilter, QueryOptions, UpdateQuery } from "mongoose";
import { RepositoryOptions } from "../../types/repository-types.js";
import { Employee, EmployeeDocument } from "./employee.model.js";
import {
  CreateEmployeePayload,
  BusinessEmployeeListFilters,
  FindEmployeesFilters,
  UpdateEmployeePayload,
} from "./employee.types.js";

export const escapeEmployeeSearch = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const findByIdAndBusiness = (
  employeeId: string,
  businessId: string,
  options: QueryOptions = {},
) => Employee.findOne({ businessId, _id: employeeId }, null, options);

const findByIdsAndBusiness = (
  businessId: string,
  employeeIds: string[],
) =>
  Employee.find({ businessId, _id: { $in: employeeIds } }).select(
    "fullName jobTitle",
  );

const findByBusinessMember = (
  businessId: string,
  businessMemberId: string,
  options: QueryOptions = {},
) => Employee.findOne({ businessId, businessMemberId }, null, options);

const claimForBusinessMember = (
  employeeId: string,
  businessId: string,
  businessMemberId: string,
  options: QueryOptions = {},
) =>
  Employee.findOneAndUpdate(
    {
      _id: employeeId,
      businessId,
      $or: [
        { businessMemberId: null },
        { businessMemberId: { $exists: false } },
      ],
    },
    { $set: { businessMemberId } },
    { returnDocument: "after", ...options },
  );

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

  if (filters.employeeTypeId) {
    query.employeeTypeId = filters.employeeTypeId;
  }

  if (filters.managerEmployeeId) {
    query.managerEmployeeId = filters.managerEmployeeId;
  }

  if (filters.groupId) {
    query.groupIds = filters.groupId;
  }

  if (filters.employmentStartDate) {
    query.employmentStartDate = filters.employmentStartDate;
  }

  if (filters.state) {
    query.state = filters.state;
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

const findActiveEmployeesBatchByBusiness = (
  businessId: string,
  afterId: string | null,
  limit: number,
) =>
  Employee.find({
    businessId,
    status: "active",
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  })
    .sort({ _id: 1 })
    .limit(limit);

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

const paginateEmployeesByBusiness = async ({
  businessId,
  page,
  limit,
  filters,
}: {
  businessId: string;
  page: number;
  limit: number;
  filters: BusinessEmployeeListFilters;
}) => {
  const query: QueryFilter<EmployeeDocument> = {
    businessId,
    ...(filters.status
      ? { status: filters.status }
      : { status: { $ne: "archived" } }),
  };

  if (filters.employeeListId) query.employeeListId = filters.employeeListId;
  if (filters.employeeTypeId) query.employeeTypeId = filters.employeeTypeId;
  if (filters.groupId) query.groupIds = filters.groupId;
  if (filters.state) {
    query.state = new RegExp(
      `^${escapeEmployeeSearch(filters.state)}$`,
      "i",
    );
  }
  if (filters.search) {
    const search = new RegExp(escapeEmployeeSearch(filters.search), "i");
    query.$or = [{ fullName: search }, { jobTitle: search }];
  }

  const [items, total] = await Promise.all([
    Employee.find(query)
      .sort({ fullName: 1, _id: 1 })
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

const updateEmployeeByBusinessAndId = (
  businessId: string,
  employeeId: string,
  payload: UpdateEmployeePayload,
  options: QueryOptions = {},
) =>
  Employee.findOneAndUpdate({ _id: employeeId, businessId }, payload, {
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

const updateVerificationResultByBusiness = (
  businessId: string,
  employeeId: string,
  payload: UpdateQuery<EmployeeDocument>,
) =>
  Employee.findOneAndUpdate({ _id: employeeId, businessId }, payload, {
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
  claimForBusinessMember,
  findByIdAndBusiness,
  findByIdsAndBusiness,
  findByBusinessMember,
  countVerificationStatesByEmployeeListId,
  createEmployee,
  createEmployees,
  deleteEmployeeById,
  findEmployeeById,
  findEmployeeByBusinessListAndId,
  findEmployeesByBusinessId,
  findEmployeesByEmployeeListId,
  findActiveEmployeesBatchByBusiness,
  paginateEmployeesByList,
  paginateEmployeesByBusiness,
  updateEmployeeById,
  updateEmployeeByBusinessAndId,
  updateVerificationResult,
  updateVerificationResultByBusiness,
};

export type EmployeeRepository = typeof employeeRepository;
