import { createHttpError } from "../../utils/api-error.js";
import { createEmployeeGroupController } from "./employee-group.controller.js";
import { employeeGroupRepository } from "./employee-group.repository.js";
import { createEmployeeGroupService } from "./employee-group.service.js";

export const employeeGroupService = createEmployeeGroupService({
  employeeGroupRepository,
  createHttpError,
});

export const employeeGroupController = createEmployeeGroupController({
  employeeGroupService,
});
