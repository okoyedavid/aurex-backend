import { EmployeeListRepository } from "./employee-list.repository.js";
import {
  CreateEmployeeList,
  CreateEmployeeListInput,
  UpdateEmployeeListInput,
} from "./employee-list.types.js";
import type { EmployeeService } from "../employee/employee.service.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { RepositoryOptions } from "../../repositories/repository-types.js";
import type { HttpError } from "../../utils/api-error.js";

type CreateEmployeeListServiceDependencies = {
  employeeListRepository: EmployeeListRepository;
  employeeService: EmployeeService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const createEmployeeListService = ({
  employeeListRepository,
  employeeService,
  withTransaction,
  createHttpError,
}: CreateEmployeeListServiceDependencies) => {
  const createEmployeeList = async (
    {
      employees = [],
      ...listInput
    }: CreateEmployeeListInput & { businessId: string; createdByUserId: string },
    options: RepositoryOptions = {},
  ) => {
    const employeeCount = employees.length;
    const listPayload: CreateEmployeeList = {
      ...listInput,
      validationStatus: employeeCount > 0 ? "pending" : "not_started",
      paymentStatus: employeeCount > 0 ? "needs_review" : "blocked",
      totalEmployeeCount: employeeCount,
      pendingVerificationCount: employeeCount,
    };
    const employeeList = await employeeListRepository.createEmployeeList(
      listPayload,
      options,
    );

    // Sequential writes are intentional: MongoDB does not support parallel
    // operations safely inside one transaction/session.
    for (const employeeInput of employees) {
      await employeeService.createEmployee(
        {
          ...employeeInput,
          businessId: listInput.businessId,
          employeeListId: employeeList.id,
        },
        options,
      );
    }

    return { employeeList };
  };

  const createEmployeeListForBusiness = async (
    payload: CreateEmployeeListInput & {
      businessId: string;
      createdByUserId: string;
    },
  ) => withTransaction((session) => createEmployeeList(payload, { session }));

  const getVerificationStatus = async ({
    businessId,
    employeeListId,
  }: {
    businessId: string;
    employeeListId: string;
  }) => {
    const employeeList =
      await employeeListRepository.findEmployeeListById(employeeListId);

    if (!employeeList || String(employeeList.businessId) !== businessId) {
      throw createHttpError("Employee list not found in this business", 404);
    }

    return {
      id: employeeList.id,
      validationStatus: employeeList.validationStatus,
      totalEmployeeCount: employeeList.totalEmployeeCount,
      pendingVerificationCount: employeeList.pendingVerificationCount,
      verifiedEmployeeCount: employeeList.verifiedEmployeeCount,
      invalidEmployeeCount: employeeList.invalidEmployeeCount,
      verificationErrorCount: employeeList.verificationErrorCount,
      lastValidationAt: employeeList.lastValidationAt,
    };
  };

  const listEmployeeLists = async ({
    businessId,
    page,
    limit,
  }: {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } =
      await employeeListRepository.paginateEmployeeListsByBusinessId({
        businessId,
        page,
        limit,
      });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const getEmployeeList = async ({
    businessId,
    employeeListId,
  }: {
    businessId: string;
    employeeListId: string;
  }) => {
    const employeeList =
      await employeeListRepository.findEmployeeListByBusinessAndId(
        businessId,
        employeeListId,
      );

    if (!employeeList) {
      throw createHttpError("Employee list not found in this business", 404);
    }

    return { employeeList };
  };

  const updateEmployeeList = async ({
    businessId,
    employeeListId,
    updates,
  }: {
    businessId: string;
    employeeListId: string;
    updates: UpdateEmployeeListInput;
  }) => {
    const existing =
      await employeeListRepository.findEmployeeListByBusinessAndId(
        businessId,
        employeeListId,
      );

    if (!existing) {
      throw createHttpError("Employee list not found in this business", 404);
    }

    const employeeList = await employeeListRepository.updateEmployeeListById(
      employeeListId,
      updates,
    );

    if (!employeeList) {
      throw createHttpError("Employee list not found", 404);
    }

    return { employeeList };
  };

  return {
    createEmployeeList,
    createEmployeeListForBusiness,
    getEmployeeList,
    getVerificationStatus,
    listEmployeeLists,
    updateEmployeeList,
  };
};

export type EmployeeListService = ReturnType<typeof createEmployeeListService>;
export { createEmployeeListService };
