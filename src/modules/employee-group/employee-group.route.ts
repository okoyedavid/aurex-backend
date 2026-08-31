import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { employeeGroupController } from "./employee-group.module.js";
import {
  createEmployeeGroupSchema,
  listEmployeeGroupsSchema,
  listSystemEmployeeGroupsSchema,
  updateEmployeeGroupSchema,
} from "./employee-group.validators.js";

const employeeGroupRouter = Router({ mergeParams: true });

employeeGroupRouter.get(
  "/system",
  protect,
  validate(listSystemEmployeeGroupsSchema),
  employeeGroupController.listSystemEmployeeGroups,
);

employeeGroupRouter.get(
  "/",
  protect,
  validate(listEmployeeGroupsSchema),
  requireBusinessPermission("employees:view"),
  employeeGroupController.listEmployeeGroups,
);

employeeGroupRouter.post(
  "/",
  protect,
  validate(createEmployeeGroupSchema),
  requireBusinessPermission("employees:update"),
  employeeGroupController.createEmployeeGroup,
);

employeeGroupRouter.patch(
  "/:employeeGroupId",
  protect,
  validate(updateEmployeeGroupSchema),
  requireBusinessPermission("employees:update"),
  employeeGroupController.updateEmployeeGroup,
);

export { employeeGroupRouter };
