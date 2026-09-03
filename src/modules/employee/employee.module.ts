import { CreateEmployeeController } from "./employee.controller.js";
import { employeeRepository } from "./employee.repository.js";
import { createEmployeeService } from "./employee.service.js";
import { employeeListRepository } from "../employee-list/employee-list.repository.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { createHttpError } from "../../utils/api-error.js";
import { employeeTypeRepository } from "../employee-type/employee-type.repository.js";
import { employeeGroupRepository } from "../employee-group/employee-group.repository.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";

const employeeService = createEmployeeService({
  employeeRepository,
  employeeListRepository,
  employeeTypeRepository,
  employeeGroupRepository,
  auditEventService,
  businessMemberRepository,
  withTransaction,
  createHttpError,
});
const employeeController = CreateEmployeeController({ employeeService });

export { employeeService, employeeController };
