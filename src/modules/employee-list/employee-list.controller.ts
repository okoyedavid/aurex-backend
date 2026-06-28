import { asyncHandler } from "../../utils/async-handler.js";
import { EmployeeListService } from "./employee-list.service.js";
import {
  createEmployeeListSchema,
  getEmployeeListSchema,
  getEmployeeListVerificationStatusSchema,
  listEmployeeListsSchema,
  updateEmployeeListSchema,
} from "./employee-list.validators.js";

type CreateEmployeeListControllerDependencies = {
  employeeListService: EmployeeListService;
};
export const createEmployeeListController = ({
  employeeListService,
}: CreateEmployeeListControllerDependencies) => {
  const createEmployeeList = asyncHandler(async (req, res) => {
    const body = createEmployeeListSchema.shape.body.parse(req.validatedBody);
    const { businessId } = createEmployeeListSchema.shape.params.parse(
      req.validatedParams,
    );

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { employeeList } =
      await employeeListService.createEmployeeListForBusiness({
      businessId,
      createdByUserId: req.user.id,
      name: body.name,
      description: body.description,
      currency: body.currency,
      defaultPayFrequency: body.payFrequency,
      employees: body.employees,
    });

    return res.status(201).json({
      data: employeeList,
      message: "Employee List Created Successfully",
      success: true,
    });
  });

  const getVerificationStatus = asyncHandler(async (req, res) => {
    const params = getEmployeeListVerificationStatusSchema.shape.params.parse(
      req.validatedParams,
    );
    const status = await employeeListService.getVerificationStatus(params);

    return res.status(200).json({
      data: status,
      message: "Employee list verification status retrieved",
      success: true,
    });
  });

  const listEmployeeLists = asyncHandler(async (req, res) => {
    const { businessId } = listEmployeeListsSchema.shape.params.parse(
      req.validatedParams,
    );
    const { page, limit } = listEmployeeListsSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await employeeListService.listEmployeeLists({
      businessId,
      page,
      limit,
    });

    return res.status(200).json({
      data: result,
      message: "Employee lists retrieved successfully",
      success: true,
    });
  });

  const getEmployeeList = asyncHandler(async (req, res) => {
    const params = getEmployeeListSchema.shape.params.parse(req.validatedParams);
    const { employeeList } = await employeeListService.getEmployeeList(params);

    return res.status(200).json({
      data: employeeList,
      message: "Employee list retrieved successfully",
      success: true,
    });
  });

  const updateEmployeeList = asyncHandler(async (req, res) => {
    const params = updateEmployeeListSchema.shape.params.parse(
      req.validatedParams,
    );
    const updates = updateEmployeeListSchema.shape.body.parse(req.validatedBody);
    const { employeeList } = await employeeListService.updateEmployeeList({
      ...params,
      updates,
    });

    return res.status(200).json({
      data: employeeList,
      message: "Employee list updated successfully",
      success: true,
    });
  });

  return {
    createEmployeeList,
    getEmployeeList,
    getVerificationStatus,
    listEmployeeLists,
    updateEmployeeList,
  };
};
