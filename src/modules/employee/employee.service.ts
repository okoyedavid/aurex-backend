import { EmployeeRepository } from "./employee.repository.js";
import type { RepositoryOptions } from "../../types/repository-types.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import type { ClientSession } from "mongoose";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";
import {
  CreateEmployeePayload,
  UpdateEmployeeInput,
} from "./employee.types.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";

type CreateEmployeeServiceDependencies = {
  employeeRepository: EmployeeRepository;
  employeeListRepository: EmployeeListRepository;
  employeeTypeRepository: EmployeeTypeRepository;
  employeeGroupRepository: EmployeeGroupRepository;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const createEmployeeService = ({
  employeeRepository,
  employeeListRepository,
  employeeTypeRepository,
  employeeGroupRepository,
  withTransaction,
  createHttpError,
}: CreateEmployeeServiceDependencies) => {
  const requireActiveEmployeeType = async (
    businessId: string,
    employeeTypeId: string,
    options: RepositoryOptions = {},
  ) => {
    const employeeType = await employeeTypeRepository.findActiveByBusinessAndId(
      businessId,
      employeeTypeId,
      options,
    );
    if (!employeeType) {
      throw createHttpError(
        "Employee type not found or inactive in this business",
        400,
      );
    }
    return employeeType;
  };

  const normalizeAndValidateGroups = async (
    businessId: string,
    groupIds: string[],
  ) => {
    const uniqueGroupIds = [...new Set(groupIds)];
    if (uniqueGroupIds.length === 0) return uniqueGroupIds;

    const groups = await employeeGroupRepository.findActiveByBusinessAndIds(
      businessId,
      uniqueGroupIds,
    );
    if (groups.length !== uniqueGroupIds.length) {
      throw createHttpError(
        "One or more employee groups were not found or are inactive in this business",
        400,
      );
    }
    return uniqueGroupIds;
  };

  const requireManagerInBusiness = async (
    businessId: string,
    managerEmployeeId: string,
    options: RepositoryOptions = {},
  ) => {
    const manager = await employeeRepository.findByIdAndBusiness(
      managerEmployeeId,
      businessId,
      options,
    );
    if (!manager || manager.status === "archived") {
      throw createHttpError(
        "Manager employee not found or archived in this business",
        400,
      );
    }
    return manager;
  };

  const validateManagerHierarchy = async (
    businessId: string,
    employeeId: string,
    managerEmployeeId: string,
  ) => {
    if (managerEmployeeId === employeeId) {
      throw createHttpError("An employee cannot manage themselves", 400);
    }

    const visited = new Set<string>([employeeId]);
    let currentManagerId: string | null = managerEmployeeId;

    while (currentManagerId) {
      if (visited.has(currentManagerId)) {
        throw createHttpError("Manager assignment would create a cycle", 400);
      }
      visited.add(currentManagerId);

      const manager = await requireManagerInBusiness(
        businessId,
        currentManagerId,
      );
      currentManagerId = manager.managerEmployeeId
        ? String(manager.managerEmployeeId)
        : null;
    }
  };

  const createEmployee = async (
    payload: CreateEmployeePayload,
    options: RepositoryOptions = {},
  ) => {
    if (payload.employeeTypeId) {
      await requireActiveEmployeeType(
        payload.businessId,
        payload.employeeTypeId,
        options,
      );
    }

    if (payload.managerEmployeeId) {
      await requireManagerInBusiness(
        payload.businessId,
        payload.managerEmployeeId,
        options,
      );
    }

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

  const createEmployeeForListInSession = async (
    payload: CreateEmployeePayload,
    session: ClientSession,
  ) => {
    const employeeList = await employeeListRepository.findEmployeeListById(
      payload.employeeListId,
      { session },
    );

    if (
      !employeeList ||
      String(employeeList.businessId) !== payload.businessId
    ) {
      throw createHttpError("Employee list not found in this business", 404);
    }

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
  };

  const createEmployeeForList = async (
    payload: CreateEmployeePayload,
    requestedBy?: string,
  ) => {
    const result = await withTransaction((session) =>
      createEmployeeForListInSession(payload, session),
    );
    try {
      await enqueuePolicyReconciliation({
        type: "RECONCILE_EMPLOYEE",
        businessId: payload.businessId,
        employeeId: result.employee.id,
        reason: "employee.created",
        requestedBy,
        requestedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to enqueue employee policy reconciliation", {
        businessId: payload.businessId,
        employeeId: result.employee.id,
        error,
      });
    }
    return result;
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
    requestedBy,
  }: {
    businessId: string;
    employeeListId: string;
    employeeId: string;
    updates: UpdateEmployeeInput;
    requestedBy?: string;
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
      (updates.bankCode !== undefined &&
        updates.bankCode !== existing.bankCode) ||
      (updates.accountNumber !== undefined &&
        updates.accountNumber !== existing.accountNumber);

    if (updates.employeeTypeId) {
      await requireActiveEmployeeType(businessId, updates.employeeTypeId);
    }

    if (updates.employeeListId && updates.employeeListId !== employeeListId) {
      await requireEmployeeList(businessId, updates.employeeListId);
    }

    if (updates.managerEmployeeId) {
      await validateManagerHierarchy(
        businessId,
        employeeId,
        updates.managerEmployeeId,
      );
    }

    const normalizedUpdates = {
      ...updates,
      ...(updates.groupIds
        ? {
            groupIds: await normalizeAndValidateGroups(
              businessId,
              updates.groupIds,
            ),
          }
        : {}),
    };

    const employee = bankDetailsChanged
      ? await employeeRepository.updateVerificationResult(employeeId, {
          $set: {
            ...normalizedUpdates,
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
      : await employeeRepository.updateEmployeeById(
          employeeId,
          normalizedUpdates,
        );

    if (!employee) {
      throw createHttpError("Employee not found", 404);
    }

    const refreshEmployeeList = async (listId: string) => {
      const counts = await employeeRepository.countVerificationStatesByEmployeeListId(listId);
      await employeeListRepository.updateEmployeeListById(listId, {
        validationStatus: "pending",
        paymentStatus: "needs_review",
        paymentBlockedReason: null,
        totalEmployeeCount: counts.total,
        pendingVerificationCount:
          counts.pending + counts.processing + counts.retrying,
        verifiedEmployeeCount: counts.verified,
        invalidEmployeeCount: counts.invalid,
        verificationErrorCount: counts.exhausted,
        lastValidationAt: null,
      });
    };

    if (bankDetailsChanged) {
      await refreshEmployeeList(employeeListId);
    }

    if (updates.employeeListId && updates.employeeListId !== employeeListId) {
      await refreshEmployeeList(employeeListId);
      await refreshEmployeeList(updates.employeeListId);
    }

    const policyRelevantFields = [
      "employeeListId",
      "employeeTypeId",
      "groupIds",
      "state",
      "employmentStartDate",
      "status",
    ];
    if (policyRelevantFields.some((field) => field in updates)) {
      try {
        await enqueuePolicyReconciliation({
          type: "RECONCILE_EMPLOYEE",
          businessId,
          employeeId,
          reason: `employee.${policyRelevantFields.filter((field) => field in updates).join("+")}.changed`,
          requestedBy,
          requestedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to enqueue employee policy reconciliation", {
          businessId,
          employeeId,
          error,
        });
      }
    }

    return { employee };
  };

  return {
    createEmployee,
    createEmployeeForList,
    createEmployeeForListInSession,
    getEmployee,
    listEmployees,
    updateEmployee,
  };
};

export type EmployeeService = ReturnType<typeof createEmployeeService>;
export { createEmployeeService };
