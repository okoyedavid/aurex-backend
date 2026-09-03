import { EmployeeRepository } from "./employee.repository.js";
import type { RepositoryOptions } from "../../types/repository-types.js";
import type { EmployeeListRepository } from "../employee-list/employee-list.repository.js";
import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import type { ClientSession } from "mongoose";
import type { EmployeeTypeRepository } from "../employee-type/employee-type.repository.js";
import type { EmployeeGroupRepository } from "../employee-group/employee-group.repository.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import {
  BusinessEmployeeListFilters,
  CreateEmployeePayload,
  UpdateEmployeeInput,
} from "./employee.types.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import {
  mapEmployeeDetail,
  mapEmployeeSummary,
  type EmployeeRelations,
  type EmployeeSource,
} from "./employee.dto.js";

type CreateEmployeeServiceDependencies = {
  employeeRepository: EmployeeRepository;
  employeeListRepository: EmployeeListRepository;
  employeeTypeRepository: EmployeeTypeRepository;
  employeeGroupRepository: EmployeeGroupRepository;
  auditEventService: AuditEventService;
  businessMemberRepository: BusinessMemberRepository;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const createEmployeeService = ({
  employeeRepository,
  employeeListRepository,
  employeeTypeRepository,
  employeeGroupRepository,
  auditEventService,
  businessMemberRepository,
  withTransaction,
  createHttpError,
}: CreateEmployeeServiceDependencies) => {
  const value = (input: unknown): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map((item) => String(item)).sort();
    if (input && typeof input === "object") return String(input);
    return input;
  };
  const object = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== "object") return {};
    if ("toObject" in input && typeof input.toObject === "function") {
      return input.toObject() as Record<string, unknown>;
    }
    return input as Record<string, unknown>;
  };
  const changedFields = (existing: Record<string, unknown>, updates: Record<string, unknown>) =>
    Object.keys(updates).filter((field) => JSON.stringify(value(existing[field])) !== JSON.stringify(value(updates[field])));
  const safeEmployeeAuditFields = new Set([
    "fullName", "jobTitle", "employeeListId", "employeeTypeId", "managerEmployeeId",
    "groupIds", "employmentStartDate", "state", "status", "payFrequency", "currency",
  ]);
  const recordEmployeeAudit = async ({
    businessId,
    employeeId,
    requestedBy,
    action,
    fields,
    before,
    after,
  }: {
    businessId: string;
    employeeId: string;
    requestedBy?: string;
    action: "business.employee.created" | "business.employee.updated";
    fields: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }) => {
    const actor = requestedBy
      ? await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, requestedBy).catch(() => null)
      : null;
    const safeFields = fields.filter((field) => safeEmployeeAuditFields.has(field));
    await auditEventService.recordEventSafely({
      eventType: action,
      category: "business",
      outcome: "success",
      businessId,
      actorBusinessMemberId: actor ? String(actor.id) : null,
      employeeId,
      subjectType: "employee",
      subjectId: employeeId,
      userId: requestedBy ?? null,
      email: null,
      changes: safeFields.length ? {
        fields: safeFields,
        before: Object.fromEntries(safeFields.map((field) => [field, value(before[field])])),
        after: Object.fromEntries(safeFields.map((field) => [field, value(after[field])])),
      } : undefined,
    });
  };
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
    await recordEmployeeAudit({
      businessId: payload.businessId,
      employeeId: result.employee.id,
      requestedBy,
      action: "business.employee.created",
      fields: ["fullName", "jobTitle", "employeeListId", "employeeTypeId", "managerEmployeeId", "employmentStartDate", "state"],
      before: {},
      after: result.employee.toObject(),
    });
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

  const requireEmployeeForBusiness = async (
    businessId: string,
    employeeId: string,
  ) => {
    const employee = await employeeRepository.findByIdAndBusiness(
      employeeId,
      businessId,
    );
    if (!employee) {
      throw createHttpError("Employee not found in this business", 404);
    }
    return employee;
  };

  const loadRelations = async (
    businessId: string,
    employees: EmployeeSource[],
  ): Promise<EmployeeRelations> => {
    const departmentIds = [
      ...new Set(employees.map((employee) => String(employee.employeeListId))),
    ];
    const employeeTypeIds = [
      ...new Set(
        employees.flatMap((employee) =>
          employee.employeeTypeId ? [String(employee.employeeTypeId)] : [],
        ),
      ),
    ];
    const groupIds = [
      ...new Set(
        employees.flatMap((employee) =>
          (employee.groupIds ?? []).map((groupId) => String(groupId)),
        ),
      ),
    ];
    const managerIds = [
      ...new Set(
        employees.flatMap((employee) =>
          employee.managerEmployeeId
            ? [String(employee.managerEmployeeId)]
            : [],
        ),
      ),
    ];

    const [departments, employeeTypes, groups, managers] = await Promise.all([
      employeeListRepository.findEmployeeListsByBusinessAndIds(
        businessId,
        departmentIds,
      ),
      employeeTypeRepository.findByBusinessAndIds(
        businessId,
        employeeTypeIds,
      ),
      employeeGroupRepository.findByBusinessAndIds(businessId, groupIds),
      employeeRepository.findByIdsAndBusiness(businessId, managerIds),
    ]);

    return {
      departments: new Map(departments.map((item) => [item.id, item])),
      employeeTypes: new Map(employeeTypes.map((item) => [item.id, item])),
      groups: new Map(groups.map((item) => [item.id, item])),
      managers: new Map(managers.map((item) => [item.id, item])),
    };
  };

  const listBusinessEmployees = async ({
    businessId,
    page,
    limit,
    ...filters
  }: BusinessEmployeeListFilters & {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } =
      await employeeRepository.paginateEmployeesByBusiness({
        businessId,
        page,
        limit,
        filters,
      });
    const relations = await loadRelations(businessId, items);
    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((employee) =>
        mapEmployeeSummary(employee, relations),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  };

  const getEmployeeProfile = async ({
    businessId,
    employeeId,
  }: {
    businessId: string;
    employeeId: string;
  }) => {
    const employee = await requireEmployeeForBusiness(businessId, employeeId);
    const relations = await loadRelations(businessId, [employee]);
    return { employee: mapEmployeeDetail(employee, relations) };
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
    const employee = await requireEmployeeForBusiness(businessId, employeeId);
    if (String(employee.employeeListId) !== employeeListId) {
      throw createHttpError("Employee not found in this employee list", 404);
    }

    return { employee };
  };

  const updateEmployeeForBusinessInternal = async ({
    businessId,
    employeeId,
    updates,
    requestedBy,
    expectedEmployeeListId,
  }: {
    businessId: string;
    employeeId: string;
    updates: UpdateEmployeeInput;
    requestedBy?: string;
    expectedEmployeeListId?: string;
  }) => {
    const existing = await requireEmployeeForBusiness(businessId, employeeId);
    const currentEmployeeListId = String(existing.employeeListId);
    if (
      expectedEmployeeListId &&
      currentEmployeeListId !== expectedEmployeeListId
    ) {
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

    if (
      updates.employeeListId &&
      updates.employeeListId !== currentEmployeeListId
    ) {
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

    const meaningfulFields = changedFields(
      object(existing),
      normalizedUpdates as Record<string, unknown>,
    );
    if (meaningfulFields.length === 0) return { employee: existing };

    const employee = bankDetailsChanged
      ? await employeeRepository.updateVerificationResultByBusiness(
          businessId,
          employeeId,
          {
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
          },
        )
      : await employeeRepository.updateEmployeeByBusinessAndId(
          businessId,
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
      await refreshEmployeeList(currentEmployeeListId);
    }

    if (
      updates.employeeListId &&
      updates.employeeListId !== currentEmployeeListId
    ) {
      await refreshEmployeeList(currentEmployeeListId);
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

    await recordEmployeeAudit({
      businessId,
      employeeId,
      requestedBy,
      action: "business.employee.updated",
      fields: meaningfulFields,
      before: object(existing),
      after: object(employee),
    });

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
  }) =>
    updateEmployeeForBusinessInternal({
      businessId,
      employeeId,
      updates,
      requestedBy,
      expectedEmployeeListId: employeeListId,
    });

  const updateBusinessEmployee = async ({
    businessId,
    employeeId,
    updates,
    requestedBy,
  }: {
    businessId: string;
    employeeId: string;
    updates: UpdateEmployeeInput;
    requestedBy?: string;
  }) => {
    await updateEmployeeForBusinessInternal({
      businessId,
      employeeId,
      updates,
      requestedBy,
    });
    return getEmployeeProfile({ businessId, employeeId });
  };

  return {
    createEmployee,
    createEmployeeForList,
    createEmployeeForListInSession,
    getEmployee,
    getEmployeeProfile,
    listBusinessEmployees,
    listEmployees,
    updateBusinessEmployee,
    updateEmployee,
  };
};

export type EmployeeService = ReturnType<typeof createEmployeeService>;
export { createEmployeeService };
