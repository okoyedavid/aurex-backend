import { QueryOptions } from "mongoose";
import { RepositoryOptions } from "../../repositories/repository-types.js";
import { EmployeeList } from "./employee-list.model.js";
import {
  CreateEmployeeList,
  UpdateEmployeeList,
} from "./employee-list.types.js";

const createEmployeeList = (
  payload: CreateEmployeeList,
  options: RepositoryOptions = {},
) =>
  EmployeeList.create([payload], options).then(([employeeList]) => {
    if (!employeeList) {
      throw new Error("Failed to create employee list");
    }

    return employeeList;
  });

const findEmployeeListById = (
  employeeListId: string,
  options: QueryOptions = {},
) => EmployeeList.findById(employeeListId, null, options);

const findEmployeeListsByBusinessId = (
  businessId: string,
  options: QueryOptions = {},
) => EmployeeList.find({ businessId }, null, options).sort({ createdAt: -1 });

const paginateEmployeeListsByBusinessId = async ({
  businessId,
  page,
  limit,
}: {
  businessId: string;
  page: number;
  limit: number;
}) => {
  const query = { businessId, status: "active" as const };
  const [items, total] = await Promise.all([
    EmployeeList.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    EmployeeList.countDocuments(query),
  ]);

  return { items, total };
};

const findEmployeeListByBusinessAndId = (
  businessId: string,
  employeeListId: string,
) => EmployeeList.findOne({ _id: employeeListId, businessId });

const findActiveEmployeeListsByBusinessId = (
  businessId: string,
  options: QueryOptions = {},
) =>
  EmployeeList.find({ businessId, status: "active" }, null, options).sort({
    createdAt: -1,
  });

const updateEmployeeListById = (
  employeeListId: string,
  payload: UpdateEmployeeList,
  options: QueryOptions = {},
) =>
  EmployeeList.findByIdAndUpdate(employeeListId, payload, {
    returnDocument: "after",
    ...options,
  });

const archiveEmployeeListById = (
  employeeListId: string,
  options: QueryOptions = {},
) =>
  updateEmployeeListById(
    employeeListId,
    {
      status: "archived",
    },
    options,
  );

const deleteEmployeeListById = (
  employeeListId: string,
  options: QueryOptions = {},
) => EmployeeList.findByIdAndDelete(employeeListId, options);

export const employeeListRepository = {
  archiveEmployeeListById,
  createEmployeeList,
  deleteEmployeeListById,
  findActiveEmployeeListsByBusinessId,
  findEmployeeListById,
  findEmployeeListByBusinessAndId,
  findEmployeeListsByBusinessId,
  paginateEmployeeListsByBusinessId,
  updateEmployeeListById,
};

export type EmployeeListRepository = typeof employeeListRepository;
