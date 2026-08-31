import type { QueryOptions } from "mongoose";
import { EmployeeType } from "./employee-type.model.js";
import type {
  EmployeeTypeStatus,
  UpdateEmployeeTypeInput,
} from "./employee-type.types.js";

const createEmployeeType = (payload: {
  businessId: string;
  name: string;
  description?: string | null;
  sourceTemplateKey?: string | null;
}) => EmployeeType.create(payload);

const findByBusinessAndId = (
  businessId: string,
  employeeTypeId: string,
  options: QueryOptions = {},
) => EmployeeType.findOne({ _id: employeeTypeId, businessId }, null, options);

const findActiveByBusinessAndId = (
  businessId: string,
  employeeTypeId: string,
  options: QueryOptions = {},
) =>
  EmployeeType.findOne(
    { _id: employeeTypeId, businessId, status: "active" },
    null,
    options,
  );

const findByBusinessAndTemplateKey = (
  businessId: string,
  sourceTemplateKey: string,
) => EmployeeType.findOne({ businessId, sourceTemplateKey });

const findByBusinessAndName = (businessId: string, name: string) =>
  EmployeeType.findOne({ businessId, name });

const paginateByBusiness = async ({
  businessId,
  page,
  limit,
  status,
}: {
  businessId: string;
  page: number;
  limit: number;
  status: EmployeeTypeStatus;
}) => {
  const filter = { businessId, status };
  const [items, total] = await Promise.all([
    EmployeeType.find(filter)
      .sort({ name: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    EmployeeType.countDocuments(filter),
  ]);

  return { items, total };
};

const updateByBusinessAndId = (
  businessId: string,
  employeeTypeId: string,
  updates: UpdateEmployeeTypeInput & { sourceTemplateKey?: string },
) =>
  EmployeeType.findOneAndUpdate(
    { _id: employeeTypeId, businessId },
    updates,
    { returnDocument: "after" },
  );

export const employeeTypeRepository = {
  createEmployeeType,
  findActiveByBusinessAndId,
  findByBusinessAndId,
  findByBusinessAndName,
  findByBusinessAndTemplateKey,
  paginateByBusiness,
  updateByBusinessAndId,
};

export type EmployeeTypeRepository = typeof employeeTypeRepository;
