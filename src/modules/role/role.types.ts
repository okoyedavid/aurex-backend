import { allowedPermissions } from "./role.model.js";

type Permission = (typeof allowedPermissions)[number];
export type CreateRolePayload = {
  businessId?: string;
  name: string;
  type: "system" | "custom";
  key: string;
  permissions?: Permission[];
  deniedPermissions?: Permission[];
};

export type UpdateCustomRoleInput = {
  name?: string;
  permissions?: Permission[];
  deniedPermissions?: Permission[];
};
