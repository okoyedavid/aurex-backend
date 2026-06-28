import { EmployeeRepository } from "./employee.repository.js";
import type { RepositoryOptions } from "../../repositories/repository-types.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import {
  CreateEmployeePayload,
  UpdateEmployeeInput,
} from "./employee.types.js";

type CreateEmployeeServiceDependencies = {
  employeeRepository: EmployeeRepository;
  employeeListRepository: EmployeeListRepository;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const createEmployeeService = ({
  employeeRepository,
  employeeListRepository,
  withTransaction,
  createHttpError,
}: CreateEmployeeServiceDependencies) => {
  const createEmployee = async (
    payload: CreateEmployeePayload,
    options: RepositoryOptions = {},
  ) => {
    const employee = await employeeRepository.createEmployee(
      {
        ...payload,
        accountVerificationStatus: "unverified",
        verificationJobStatus: "pending",
        paymentStatus: "blocked",
      },
      options,
    );

    return { employee };
  };

  const createEmployeeForList = async (payload: CreateEmployeePayload) => {
    const employeeList = await employeeListRepository.findEmployeeListById(
      payload.employeeListId,
    );

    if (!employeeList || String(employeeList.businessId) !== payload.businessId) {
      throw createHttpError("Employee list not found in this business", 404);
    }

    return withTransaction(async (session) => {
      const result = await createEmployee(payload, { session });
      await employeeListRepository.updateEmployeeListById(
        payload.employeeListId,
        {
          validationStatus: "pending",
          paymentStatus: "needs_review",
          totalEmployeeCount: employeeList.totalEmployeeCount + 1,
          pendingVerificationCount: employeeList.pendingVerificationCount + 1,
        },
        { session },
      );
      return result;
    });
  };

  const requireEmployeeList = async (
    businessId: string,
    employeeListId: string,
  ) => {
    const employeeList =
      await employeeListRepository.findEmployeeListByBusinessAndId(
        businessId,
        employeeListId,
      );

    if (!employeeList) {
      throw createHttpError("Employee list not found in this business", 404);
    }

    return employeeList;
  };

  const listEmployees = async ({
    businessId,
    employeeListId,
    page,
    limit,
  }: {
    businessId: string;
    employeeListId: string;
    page: number;
    limit: number;
  }) => {
    await requireEmployeeList(businessId, employeeListId);
    const { items, total } = await employeeRepository.paginateEmployeesByList({
      businessId,
      employeeListId,
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

  const getEmployee = async ({
    businessId,
    employeeListId,
    employeeId,
  }: {
    businessId: string;
    employeeListId: string;
    employeeId: string;
  }) => {
    const employee = await employeeRepository.findEmployeeByBusinessListAndId(
      businessId,
      employeeListId,
      employeeId,
    );

    if (!employee) {
      throw createHttpError("Employee not found in this employee list", 404);
    }

    return { employee };
  };

  const updateEmployee = async ({
    businessId,
    employeeListId,
    employeeId,
    updates,
  }: {
    businessId: string;
    employeeListId: string;
    employeeId: string;
    updates: UpdateEmployeeInput;
  }) => {
    const existing = await employeeRepository.findEmployeeByBusinessListAndId(
      businessId,
      employeeListId,
      employeeId,
    );

    if (!existing) {
      throw createHttpError("Employee not found in this employee list", 404);
    }

    const bankDetailsChanged =
      (updates.bankCode !== undefined && updates.bankCode !== existing.bankCode) ||
      (updates.accountNumber !== undefined &&
        updates.accountNumber !== existing.accountNumber);

    const employee = bankDetailsChanged
      ? await employeeRepository.updateVerificationResult(employeeId, {
          $set: {
            ...updates,
            accountVerificationStatus: "stale",
            verificationJobStatus: "pending",
            verificationAttemptCount: 0,
            paymentStatus: "blocked",
          },
          $unset: {
            accountName: 1,
            accountVerifiedAt: 1,
            accountVerificationFailureReason: 1,
            lastAccountValidationAt: 1,
            nextVerificationAttemptAt: 1,
          },
        })
      : await employeeRepository.updateEmployeeById(employeeId, updates);

    if (!employee) {
      throw createHttpError("Employee not found", 404);
    }

    if (bankDetailsChanged) {
      const counts =
        await employeeRepository.countVerificationStatesByEmployeeListId(
          employeeListId,
        );
      await employeeListRepository.updateEmployeeListById(employeeListId, {
        validationStatus: "pending",
        paymentStatus: "needs_review",
        paymentBlockedReason: null,
        pendingVerificationCount:
          counts.pending + counts.processing + counts.retrying,
        verifiedEmployeeCount: counts.verified,
        invalidEmployeeCount: counts.invalid,
        verificationErrorCount: counts.exhausted,
        lastValidationAt: null,
      });
    }

    return { employee };
  };

  return {
    createEmployee,
    createEmployeeForList,
    getEmployee,
    listEmployees,
    updateEmployee,
  };
};

export type EmployeeService = ReturnType<typeof createEmployeeService>;
export { createEmployeeService };
