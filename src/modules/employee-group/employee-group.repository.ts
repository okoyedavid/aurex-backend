import type { QueryOptions } from "mongoose";
import { EmployeeGroup } from "./employee-group.model.js";
import type {
  EmployeeGroupStatus,
  UpdateEmployeeGroupInput,
} from "./employee-group.types.js";

const createEmployeeGroup = (payload: {
  businessId: string;
  name: string;
  description?: string | null;
  sourceTemplateKey?: string | null;
}) => EmployeeGroup.create(payload);

const findByBusinessAndId = (
  businessId: string,
  employeeGroupId: string,
  options: QueryOptions = {},
) => EmployeeGroup.findOne({ _id: employeeGroupId, businessId }, null, options);

const findActiveByBusinessAndIds = (
  businessId: string,
  employeeGroupIds: string[],
  options: QueryOptions = {},
) =>
  EmployeeGroup.find(
    {
      _id: { $in: employeeGroupIds },
      businessId,
      status: "active",
    },
    null,
    options,
  );

const findByBusinessAndIds = (
  businessId: string,
  employeeGroupIds: string[],
) =>
  EmployeeGroup.find({ businessId, _id: { $in: employeeGroupIds } }).select(
    "name description status",
  );

const findByBusinessAndTemplateKey = (
  businessId: string,
  sourceTemplateKey: string,
) => EmployeeGroup.findOne({ businessId, sourceTemplateKey });

const findByBusinessAndName = (businessId: string, name: string) =>
  EmployeeGroup.findOne({ businessId, name });

const paginateByBusiness = async ({
  businessId,
  page,
  limit,
  status,
}: {
  businessId: string;
  page: number;
  limit: number;
  status: EmployeeGroupStatus;
}) => {
  const filter = { businessId, status };
  const [items, total] = await Promise.all([
    EmployeeGroup.find(filter)
      .sort({ name: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    EmployeeGroup.countDocuments(filter),
  ]);

  return { items, total };
};

const updateByBusinessAndId = (
  businessId: string,
  employeeGroupId: string,
  updates: UpdateEmployeeGroupInput & { sourceTemplateKey?: string },
) =>
  EmployeeGroup.findOneAndUpdate(
    { _id: employeeGroupId, businessId },
    updates,
    { returnDocument: "after" },
  );

export const employeeGroupRepository = {
  createEmployeeGroup,
  findActiveByBusinessAndIds,
  findByBusinessAndId,
  findByBusinessAndIds,
  findByBusinessAndName,
  findByBusinessAndTemplateKey,
  paginateByBusiness,
  updateByBusinessAndId,
};

export type EmployeeGroupRepository = typeof employeeGroupRepository;
