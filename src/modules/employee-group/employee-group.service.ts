import type { HttpError } from "../../utils/api-error.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { defaultEmployeeGroups } from "./employee-group.defaults.js";
import type { EmployeeGroupRepository } from "./employee-group.repository.js";
import type {
  CreateEmployeeGroupInput,
  EmployeeGroupStatus,
  UpdateEmployeeGroupInput,
} from "./employee-group.types.js";

type CreateEmployeeGroupServiceDependencies = {
  employeeGroupRepository: EmployeeGroupRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const createEmployeeGroupService = ({
  employeeGroupRepository,
  createHttpError,
}: CreateEmployeeGroupServiceDependencies) => {
  const listSystemEmployeeGroups = () => ({ items: defaultEmployeeGroups });

  const listEmployeeGroups = async ({
    businessId,
    page,
    limit,
    status,
  }: {
    businessId: string;
    page: number;
    limit: number;
    status: EmployeeGroupStatus;
  }) => {
    const { items, total } = await employeeGroupRepository.paginateByBusiness({
      businessId,
      page,
      limit,
      status,
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

  const resolveTemplate = async (businessId: string, templateKey: string) => {
    const template = defaultEmployeeGroups.find(
      (candidate) => candidate.key === templateKey,
    );
    if (!template) {
      throw createHttpError("Employee group template not found", 404);
    }

    const existingByTemplate =
      await employeeGroupRepository.findByBusinessAndTemplateKey(
        businessId,
        template.key,
      );
    if (existingByTemplate) {
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          existingByTemplate.id,
          { status: "active" },
        );
      return { employeeGroup, created: false };
    }

    const existingByName = await employeeGroupRepository.findByBusinessAndName(
      businessId,
      template.name,
    );
    if (existingByName) {
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          existingByName.id,
          { sourceTemplateKey: template.key, status: "active" },
        );
      return { employeeGroup, created: false };
    }

    try {
      const employeeGroup = await employeeGroupRepository.createEmployeeGroup({
        businessId,
        name: template.name,
        sourceTemplateKey: template.key,
      });
      return { employeeGroup, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const employeeGroup =
        (await employeeGroupRepository.findByBusinessAndTemplateKey(
          businessId,
          template.key,
        )) ??
        (await employeeGroupRepository.findByBusinessAndName(
          businessId,
          template.name,
        ));
      if (employeeGroup) return { employeeGroup, created: false };
      throw error;
    }
  };

  const createEmployeeGroup = async (
    businessId: string,
    input: CreateEmployeeGroupInput,
  ) => {
    if ("templateKey" in input) {
      return resolveTemplate(businessId, input.templateKey);
    }

    try {
      const employeeGroup = await employeeGroupRepository.createEmployeeGroup({
        businessId,
        name: input.name,
        description: input.description,
      });
      return { employeeGroup, created: true };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError(
          "An employee group with this name already exists",
          409,
        );
      }
      throw error;
    }
  };

  const updateEmployeeGroup = async ({
    businessId,
    employeeGroupId,
    updates,
  }: {
    businessId: string;
    employeeGroupId: string;
    updates: UpdateEmployeeGroupInput;
  }) => {
    try {
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          employeeGroupId,
          updates,
        );
      if (!employeeGroup) {
        throw createHttpError("Employee group not found in this business", 404);
      }
      if (updates.status) {
        await enqueuePolicyReconciliation({
          type: "RECONCILE_BUSINESS",
          businessId,
          reason: "employee_group.status.changed",
          requestedAt: new Date().toISOString(),
        }).catch((error) =>
          console.error("Failed to enqueue employee-group policy reconciliation", {
            businessId,
            employeeGroupId,
            error,
          }),
        );
      }
      return { employeeGroup };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError(
          "An employee group with this name already exists",
          409,
        );
      }
      throw error;
    }
  };

  return {
    createEmployeeGroup,
    listEmployeeGroups,
    listSystemEmployeeGroups,
    updateEmployeeGroup,
  };
};

export type EmployeeGroupService = ReturnType<
  typeof createEmployeeGroupService
>;
