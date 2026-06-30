import { Role } from "./role.model.js";
import { CreateRolePayload } from "./role.types.js";
import { RepositoryOptions } from "../../types/repository-types.js";

const createRole = (
  payload: CreateRolePayload,
  options: RepositoryOptions = {},
) =>
  Role.create([payload], options).then(([role]) => {
    if (!role) {
      throw new Error("Failed to create role");
    }

    return role;
  });

const activeRoleFilter = { status: { $ne: "archived" } } as const;

const findAssignableRoleById = (
  roleId: string,
  businessId: string,
  options: RepositoryOptions = {},
) =>
  Role.findOne({
    _id: roleId,
    ...activeRoleFilter,
    $or: [
      { type: "system", businessId: null },
      { type: "custom", businessId },
    ],
  }).session(options.session ?? null);

const findSystemRoleByKey = (key: string) =>
  Role.findOne({
    key,
    type: "system",
    businessId: null,
    ...activeRoleFilter,
  });

const paginateRolesForBusiness = async ({
  businessId,
  page,
  limit,
}: {
  businessId: string;
  page: number;
  limit: number;
}) => {
  const filter = {
    ...activeRoleFilter,
    $or: [
      { type: "system" as const, businessId: null },
      { type: "custom" as const, businessId },
    ],
  };
  const [items, total] = await Promise.all([
    Role.find(filter)
      .sort({ type: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Role.countDocuments(filter),
  ]);

  return { items, total };
};

const paginateAssignableRolesForBusiness = async ({
  businessId,
  page,
  limit,
}: {
  businessId: string;
  page: number;
  limit: number;
}) => {
  const filter = {
    ...activeRoleFilter,
    $or: [
      { type: "system" as const, businessId: null, key: { $ne: "owner" } },
      { type: "custom" as const, businessId },
    ],
  };
  const [items, total] = await Promise.all([
    Role.find(filter)
      .sort({ type: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Role.countDocuments(filter),
  ]);

  return { items, total };
};

const findCustomRoleById = (businessId: string, roleId: string) =>
  Role.findOne({
    _id: roleId,
    businessId,
    type: "custom",
    ...activeRoleFilter,
  });

const updateCustomRole = (
  businessId: string,
  roleId: string,
  updates: {
    name?: string;
    permissions?: string[];
    deniedPermissions?: string[];
  },
) =>
  Role.findOneAndUpdate(
    {
      _id: roleId,
      businessId,
      type: "custom",
      ...activeRoleFilter,
    },
    updates,
    { returnDocument: "after", runValidators: true },
  );

const archiveCustomRole = (businessId: string, roleId: string) =>
  Role.findOneAndUpdate(
    {
      _id: roleId,
      businessId,
      type: "custom",
      ...activeRoleFilter,
    },
    { status: "archived" },
    { returnDocument: "after" },
  );

export const roleRepository = {
  archiveCustomRole,
  createRole,
  findAssignableRoleById,
  findCustomRoleById,
  findSystemRoleByKey,
  paginateAssignableRolesForBusiness,
  paginateRolesForBusiness,
  updateCustomRole,
};

export type RoleRepository = typeof roleRepository;
