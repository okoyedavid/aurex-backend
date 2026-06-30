import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { roleController } from "./role.module.js";
import {
  createCustomRoleSchema,
  getRoleSchema,
  listRolesSchema,
  updateCustomRoleSchema,
} from "./role.validators.js";

const roleRouter = Router({ mergeParams: true });

roleRouter.get(
  "/assignable",
  protect,
  validate(listRolesSchema),
  requireBusinessPermission("members:invite"),
  roleController.listAssignableRoles,
);

roleRouter.get(
  "/",
  protect,
  validate(listRolesSchema),
  requireBusinessPermission("roles:view"),
  roleController.listRoles,
);

roleRouter.post(
  "/",
  protect,
  validate(createCustomRoleSchema),
  requireBusinessPermission("roles:create"),
  roleController.createCustomRole,
);

roleRouter.get(
  "/:roleId",
  protect,
  validate(getRoleSchema),
  requireBusinessPermission("roles:view"),
  roleController.getRole,
);

roleRouter.patch(
  "/:roleId",
  protect,
  validate(updateCustomRoleSchema),
  requireBusinessPermission("roles:update"),
  roleController.updateCustomRole,
);

roleRouter.delete(
  "/:roleId",
  protect,
  validate(getRoleSchema),
  requireBusinessPermission("roles:delete"),
  roleController.archiveCustomRole,
);

export { roleRouter };
