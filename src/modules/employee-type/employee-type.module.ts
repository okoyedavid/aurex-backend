import { createHttpError } from "../../utils/api-error.js";
import { createEmployeeTypeController } from "./employee-type.controller.js";
import { employeeTypeRepository } from "./employee-type.repository.js";
import { createEmployeeTypeService } from "./employee-type.service.js";

export const employeeTypeService = createEmployeeTypeService({
  employeeTypeRepository,
  createHttpError,
});

export const employeeTypeController = createEmployeeTypeController({
  employeeTypeService,
});
