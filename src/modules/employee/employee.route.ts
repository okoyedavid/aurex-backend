import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { employeeController } from "./employee.module.js";
import {
  createEmployeeSchema,
  getEmployeeSchema,
  listEmployeesSchema,
  updateEmployeeSchema,
} from "./employee.validators.js";

const employeeRouter = Router({ mergeParams: true });

employeeRouter.get(
  "/",
  protect,
  validate(listEmployeesSchema),
  requireBusinessPermission("employees:view"),
  employeeController.listEmployees,
);

employeeRouter.post(
  "/",
  protect,
  validate(createEmployeeSchema),
  requireBusinessPermission("employees:create"),
  employeeController.createEmployee,
);

employeeRouter.get(
  "/:employeeId",
  protect,
  validate(getEmployeeSchema),
  requireBusinessPermission("employees:view"),
  employeeController.getEmployee,
);

employeeRouter.patch(
  "/:employeeId",
  protect,
  validate(updateEmployeeSchema),
  requireBusinessPermission("employees:update"),
  employeeController.updateEmployee,
);

export { employeeRouter };
