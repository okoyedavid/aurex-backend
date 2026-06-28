import { asyncHandler } from "../../utils/async-handler.js";
import { EmployeeService } from "./employee.service.js";
import {
  createEmployeeSchema,
  getEmployeeSchema,
  listEmployeesSchema,
  updateEmployeeSchema,
} from "./employee.validators.js";

type CreateEmployeeControllerDependencies = {
  employeeService: EmployeeService;
};

export const CreateEmployeeController = ({
  employeeService,
}: CreateEmployeeControllerDependencies) => {
  const createEmployee = asyncHandler(async (req, res) => {
    const body = createEmployeeSchema.shape.body.parse(req.validatedBody);
    const { businessId, employeeListId } =
      createEmployeeSchema.shape.params.parse(req.validatedParams);
    const {
      fullName,
      jobTitle,
      bankCode,
      bankName,
      accountNumber,
      currency,
      payFrequency,
      amount,
    } = body;

    const { employee } = await employeeService.createEmployeeForList({
      employeeListId,
      businessId,
      fullName,
      jobTitle,
      bankCode,
      bankName,
      accountNumber,
      currency,
      payFrequency,
      amount,
    });

    res.status(201).json({
      data: employee,
      message: "Employee created successfully",
      success: true,
    });
  });

  const listEmployees = asyncHandler(async (req, res) => {
    const params = listEmployeesSchema.shape.params.parse(req.validatedParams);
    const query = listEmployeesSchema.shape.query.parse(req.validatedQuery);
    const result = await employeeService.listEmployees({ ...params, ...query });

    return res.status(200).json({
      data: result,
      message: "Employees retrieved successfully",
      success: true,
    });
  });

  const getEmployee = asyncHandler(async (req, res) => {
    const params = getEmployeeSchema.shape.params.parse(req.validatedParams);
    const { employee } = await employeeService.getEmployee(params);

    return res.status(200).json({
      data: employee,
      message: "Employee retrieved successfully",
      success: true,
    });
  });

  const updateEmployee = asyncHandler(async (req, res) => {
    const params = updateEmployeeSchema.shape.params.parse(req.validatedParams);
    const updates = updateEmployeeSchema.shape.body.parse(req.validatedBody);
    const { employee } = await employeeService.updateEmployee({
      ...params,
      updates,
    });

    return res.status(200).json({
      data: employee,
      message: "Employee updated successfully",
      success: true,
    });
  });

  return { createEmployee, getEmployee, listEmployees, updateEmployee };
};
