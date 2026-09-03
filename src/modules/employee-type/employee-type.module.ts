import { createHttpError } from "../../utils/api-error.js";
import { createEmployeeTypeController } from "./employee-type.controller.js";
import { employeeTypeRepository } from "./employee-type.repository.js";
import { createEmployeeTypeService } from "./employee-type.service.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";

export const employeeTypeService = createEmployeeTypeService({
  employeeTypeRepository,
  createHttpError,
  auditEventService,
  businessMemberRepository,
});

export const employeeTypeController = createEmployeeTypeController({
  employeeTypeService,
});
