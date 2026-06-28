import { CreateEmployeeController } from "./employee.controller.js";
import { employeeRepository } from "./employee.repository.js";
import { createEmployeeService } from "./employee.service.js";
import { employeeListRepository } from "../employee-list/employee-list.repository.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { createHttpError } from "../../utils/api-error.js";

const employeeService = createEmployeeService({
  employeeRepository,
  employeeListRepository,
  withTransaction,
  createHttpError,
});
const employeeController = CreateEmployeeController({ employeeService });

export { employeeService, employeeController };
