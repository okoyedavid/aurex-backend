import { asyncHandler } from "../../utils/async-handler.js";
import type { EmployeeTypeService } from "./employee-type.service.js";
import {
  createEmployeeTypeSchema,
  listEmployeeTypesSchema,
  listSystemEmployeeTypesSchema,
  updateEmployeeTypeSchema,
} from "./employee-type.validators.js";

export const createEmployeeTypeController = ({
  employeeTypeService,
}: {
  employeeTypeService: EmployeeTypeService;
}) => {
  const listSystemEmployeeTypes = asyncHandler(async (req, res) => {
    listSystemEmployeeTypesSchema.shape.params.parse(req.validatedParams);
    return res.status(200).json({
      data: employeeTypeService.listSystemEmployeeTypes(),
      message: "System employee type templates retrieved",
      success: true,
    });
  });

  const listEmployeeTypes = asyncHandler(async (req, res) => {
    const { businessId } = listEmployeeTypesSchema.shape.params.parse(
      req.validatedParams,
    );
    const query = listEmployeeTypesSchema.shape.query.parse(req.validatedQuery);
    const result = await employeeTypeService.listEmployeeTypes({
      businessId,
      ...query,
    });
    return res.status(200).json({
      data: result,
      message: "Employee types retrieved",
      success: true,
    });
  });

  const createEmployeeType = asyncHandler(async (req, res) => {
    const { businessId } = createEmployeeTypeSchema.shape.params.parse(
      req.validatedParams,
    );
    const body = createEmployeeTypeSchema.shape.body.parse(req.validatedBody);
    const result = await employeeTypeService.createEmployeeType(
      businessId,
      body,
    );
    return res.status(result.created ? 201 : 200).json({
      data: result.employeeType,
      meta: { created: result.created },
      message: result.created
        ? "Employee type created"
        : "Employee type resolved",
      success: true,
    });
  });

  const updateEmployeeType = asyncHandler(async (req, res) => {
    const params = updateEmployeeTypeSchema.shape.params.parse(
      req.validatedParams,
    );
    const updates = updateEmployeeTypeSchema.shape.body.parse(
      req.validatedBody,
    );
    const { employeeType } = await employeeTypeService.updateEmployeeType({
      ...params,
      updates,
    });
    return res.status(200).json({
      data: employeeType,
      message: "Employee type updated",
      success: true,
    });
  });

  return {
    createEmployeeType,
    listEmployeeTypes,
    listSystemEmployeeTypes,
    updateEmployeeType,
  };
};
