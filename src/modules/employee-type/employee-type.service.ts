import type { HttpError } from "../../utils/api-error.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { defaultEmployeeTypes } from "./employee-type.defaults.js";
import type { EmployeeTypeRepository } from "./employee-type.repository.js";
import type {
  CreateEmployeeTypeInput,
  EmployeeTypeStatus,
  UpdateEmployeeTypeInput,
} from "./employee-type.types.js";

type CreateEmployeeTypeServiceDependencies = {
  employeeTypeRepository: EmployeeTypeRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const createEmployeeTypeService = ({
  employeeTypeRepository,
  createHttpError,
}: CreateEmployeeTypeServiceDependencies) => {
  const listSystemEmployeeTypes = () => ({ items: defaultEmployeeTypes });

  const listEmployeeTypes = async ({
    businessId,
    page,
    limit,
    status,
  }: {
    businessId: string;
    page: number;
    limit: number;
    status: EmployeeTypeStatus;
  }) => {
    const { items, total } = await employeeTypeRepository.paginateByBusiness({
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
    const template = defaultEmployeeTypes.find(
      (candidate) => candidate.key === templateKey,
    );
    if (!template) {
      throw createHttpError("Employee type template not found", 404);
    }

    const existingByTemplate =
      await employeeTypeRepository.findByBusinessAndTemplateKey(
        businessId,
        template.key,
      );
    if (existingByTemplate) {
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        existingByTemplate.id,
        { status: "active" },
      );
      return { employeeType, created: false };
    }

    const existingByName = await employeeTypeRepository.findByBusinessAndName(
      businessId,
      template.name,
    );
    if (existingByName) {
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        existingByName.id,
        { sourceTemplateKey: template.key, status: "active" },
      );
      return { employeeType, created: false };
    }

    try {
      const employeeType = await employeeTypeRepository.createEmployeeType({
        businessId,
        name: template.name,
        sourceTemplateKey: template.key,
      });
      return { employeeType, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const employeeType =
        (await employeeTypeRepository.findByBusinessAndTemplateKey(
          businessId,
          template.key,
        )) ??
        (await employeeTypeRepository.findByBusinessAndName(
          businessId,
          template.name,
        ));
      if (employeeType) return { employeeType, created: false };
      throw error;
    }
  };

  const createEmployeeType = async (
    businessId: string,
    input: CreateEmployeeTypeInput,
  ) => {
    if ("templateKey" in input) {
      return resolveTemplate(businessId, input.templateKey);
    }

    try {
      const employeeType = await employeeTypeRepository.createEmployeeType({
        businessId,
        name: input.name,
        description: input.description,
      });
      return { employeeType, created: true };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError(
          "An employee type with this name already exists",
          409,
        );
      }
      throw error;
    }
  };

  const updateEmployeeType = async ({
    businessId,
    employeeTypeId,
    updates,
  }: {
    businessId: string;
    employeeTypeId: string;
    updates: UpdateEmployeeTypeInput;
  }) => {
    try {
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        employeeTypeId,
        updates,
      );
      if (!employeeType) {
        throw createHttpError("Employee type not found in this business", 404);
      }
      if (updates.status) {
        await enqueuePolicyReconciliation({
          type: "RECONCILE_BUSINESS",
          businessId,
          reason: "employee_type.status.changed",
          requestedAt: new Date().toISOString(),
        }).catch((error) =>
          console.error("Failed to enqueue employee-type policy reconciliation", {
            businessId,
            employeeTypeId,
            error,
          }),
        );
      }
      return { employeeType };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError(
          "An employee type with this name already exists",
          409,
        );
      }
      throw error;
    }
  };

  return {
    createEmployeeType,
    listEmployeeTypes,
    listSystemEmployeeTypes,
    updateEmployeeType,
  };
};

export type EmployeeTypeService = ReturnType<
  typeof createEmployeeTypeService
>;
