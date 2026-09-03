import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { employeeController } from "./employee.module.js";
import {
  getBusinessEmployeeSchema,
  listBusinessEmployeesSchema,
  updateBusinessEmployeeSchema,
} from "./employee.validators.js";

const businessEmployeeRouter = Router({ mergeParams: true });

businessEmployeeRouter.get(
  "/",
  protect,
  validate(listBusinessEmployeesSchema),
  requireBusinessPermission("employees:view"),
  employeeController.listBusinessEmployees,
);

businessEmployeeRouter.get(
  "/:employeeId",
  protect,
  validate(getBusinessEmployeeSchema),
  requireBusinessPermission("employees:view"),
  employeeController.getBusinessEmployee,
);

businessEmployeeRouter.patch(
  "/:employeeId",
  protect,
  validate(updateBusinessEmployeeSchema),
  requireBusinessPermission("employees:update"),
  employeeController.updateBusinessEmployee,
);

export { businessEmployeeRouter };
