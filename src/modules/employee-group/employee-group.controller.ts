import { asyncHandler } from "../../utils/async-handler.js";
import type { EmployeeGroupService } from "./employee-group.service.js";
import {
  createEmployeeGroupSchema,
  listEmployeeGroupsSchema,
  listSystemEmployeeGroupsSchema,
  updateEmployeeGroupSchema,
} from "./employee-group.validators.js";

export const createEmployeeGroupController = ({
  employeeGroupService,
}: {
  employeeGroupService: EmployeeGroupService;
}) => {
  const listSystemEmployeeGroups = asyncHandler(async (req, res) => {
    listSystemEmployeeGroupsSchema.shape.params.parse(req.validatedParams);
    return res.status(200).json({
      data: employeeGroupService.listSystemEmployeeGroups(),
      message: "System employee group templates retrieved",
      success: true,
    });
  });

  const listEmployeeGroups = asyncHandler(async (req, res) => {
    const { businessId } = listEmployeeGroupsSchema.shape.params.parse(
      req.validatedParams,
    );
    const query = listEmployeeGroupsSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await employeeGroupService.listEmployeeGroups({
      businessId,
      ...query,
    });
    return res.status(200).json({
      data: result,
      message: "Employee groups retrieved",
      success: true,
    });
  });

  const createEmployeeGroup = asyncHandler(async (req, res) => {
    const { businessId } = createEmployeeGroupSchema.shape.params.parse(
      req.validatedParams,
    );
    const body = createEmployeeGroupSchema.shape.body.parse(req.validatedBody);
    const result = await employeeGroupService.createEmployeeGroup(
      businessId,
      body,
    );
    return res.status(result.created ? 201 : 200).json({
      data: result.employeeGroup,
      meta: { created: result.created },
      message: result.created
        ? "Employee group created"
        : "Employee group resolved",
      success: true,
    });
  });

  const updateEmployeeGroup = asyncHandler(async (req, res) => {
    const params = updateEmployeeGroupSchema.shape.params.parse(
      req.validatedParams,
    );
    const updates = updateEmployeeGroupSchema.shape.body.parse(
      req.validatedBody,
    );
    const { employeeGroup } = await employeeGroupService.updateEmployeeGroup({
      ...params,
      updates,
    });
    return res.status(200).json({
      data: employeeGroup,
      message: "Employee group updated",
      success: true,
    });
  });

  return {
    createEmployeeGroup,
    listEmployeeGroups,
    listSystemEmployeeGroups,
    updateEmployeeGroup,
  };
};
