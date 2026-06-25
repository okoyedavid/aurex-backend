import { Role } from "./role.model.js";
import { CreateRolePayload } from "./role.types.js";
import { RepositoryOptions } from "../../repositories/repository-types.js";

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

export const roleRepository = {
  createRole,
};

export type RoleRepository = typeof roleRepository;
