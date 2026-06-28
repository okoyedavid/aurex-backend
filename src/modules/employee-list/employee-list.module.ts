import { createEmployeeListController } from "./employee-list.controller.js";
import { employeeListRepository } from "./employee-list.repository.js";
import { createEmployeeListService } from "./employee-list.service.js";
import { employeeService } from "../employee/employee.module.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { createHttpError } from "../../utils/api-error.js";

const employeeListService = createEmployeeListService({
  employeeListRepository,
  employeeService,
  withTransaction,
  createHttpError,
});
const employeeListController = createEmployeeListController({
  employeeListService,
});

export { employeeListController, employeeListService };
