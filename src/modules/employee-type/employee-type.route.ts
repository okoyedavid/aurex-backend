import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { employeeTypeController } from "./employee-type.module.js";
import {
  createEmployeeTypeSchema,
  listEmployeeTypesSchema,
  listSystemEmployeeTypesSchema,
  updateEmployeeTypeSchema,
} from "./employee-type.validators.js";

const employeeTypeRouter = Router({ mergeParams: true });

employeeTypeRouter.get(
  "/system",
  protect,
  validate(listSystemEmployeeTypesSchema),
  employeeTypeController.listSystemEmployeeTypes,
);

employeeTypeRouter.get(
  "/",
  protect,
  validate(listEmployeeTypesSchema),
  requireBusinessPermission("employees:view"),
  employeeTypeController.listEmployeeTypes,
);

employeeTypeRouter.post(
  "/",
  protect,
  validate(createEmployeeTypeSchema),
  requireBusinessPermission("employees:create"),
  employeeTypeController.createEmployeeType,
);

employeeTypeRouter.patch(
  "/:employeeTypeId",
  protect,
  validate(updateEmployeeTypeSchema),
  requireBusinessPermission("employees:update"),
  employeeTypeController.updateEmployeeType,
);

export { employeeTypeRouter };
