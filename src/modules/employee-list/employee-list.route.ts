import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { employeeRouter } from "../employee/employee.route.js";
import { employeeListController } from "./employee-list.module.js";
import {
  createEmployeeListSchema,
  getEmployeeListSchema,
  getEmployeeListVerificationStatusSchema,
  listEmployeeListsSchema,
  updateEmployeeListSchema,
} from "./employee-list.validators.js";

const employeeListRouter = Router({ mergeParams: true });

employeeListRouter.get(
  "/",
  protect,
  validate(listEmployeeListsSchema),
  requireBusinessPermission("employee_lists:view"),
  employeeListController.listEmployeeLists,
);

employeeListRouter.post(
  "/",
  protect,
  validate(createEmployeeListSchema),
  requireBusinessPermission("employee_lists:create"),
  employeeListController.createEmployeeList,
);

employeeListRouter.get(
  "/:employeeListId/verification-status",
  protect,
  validate(getEmployeeListVerificationStatusSchema),
  requireBusinessPermission("employee_lists:view"),
  employeeListController.getVerificationStatus,
);

employeeListRouter.get(
  "/:employeeListId",
  protect,
  validate(getEmployeeListSchema),
  requireBusinessPermission("employee_lists:view"),
  employeeListController.getEmployeeList,
);

employeeListRouter.patch(
  "/:employeeListId",
  protect,
  validate(updateEmployeeListSchema),
  requireBusinessPermission("employee_lists:update"),
  employeeListController.updateEmployeeList,
);

employeeListRouter.use("/:employeeListId/employees", employeeRouter);

export { employeeListRouter };
