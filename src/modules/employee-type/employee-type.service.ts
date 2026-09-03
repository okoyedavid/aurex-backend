import type { HttpError } from "../../utils/api-error.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { defaultEmployeeTypes } from "./employee-type.defaults.js";
import type { EmployeeTypeRepository } from "./employee-type.repository.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type {
  CreateEmployeeTypeInput,
  EmployeeTypeStatus,
  UpdateEmployeeTypeInput,
} from "./employee-type.types.js";

type CreateEmployeeTypeServiceDependencies = {
  employeeTypeRepository: EmployeeTypeRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
  auditEventService: AuditEventService;
  businessMemberRepository: BusinessMemberRepository;
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const createEmployeeTypeService = ({
  employeeTypeRepository,
  createHttpError,
  auditEventService,
  businessMemberRepository,
}: CreateEmployeeTypeServiceDependencies) => {
  const recordAudit = async (businessId: string, requestedBy: string | undefined, employeeType: { id: string; name: string; toObject?: () => Record<string, unknown> }, action: "business.employee_type.created" | "business.employee_type.updated", fields: string[] = []) => {
    const actor = requestedBy ? await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, requestedBy).catch(() => null) : null;
    await auditEventService.recordEventSafely({
      eventType: action, category: "business", outcome: "success", businessId,
      actorBusinessMemberId: actor ? String(actor.id) : null,
      subjectType: "employee_type", subjectId: employeeType.id,
      userId: requestedBy ?? null, email: null,
      changes: fields.length ? { fields, before: {}, after: employeeType.toObject?.() ?? { name: employeeType.name } } : undefined,
    });
  };
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

  const resolveTemplate = async (businessId: string, templateKey: string, requestedBy?: string) => {
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
      if (existingByTemplate.status === "active") {
        return { employeeType: existingByTemplate, created: false };
      }
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        existingByTemplate.id,
        { status: "active" },
      );
      if (employeeType) await recordAudit(businessId, requestedBy, employeeType, "business.employee_type.updated", ["status"]);
      return { employeeType, created: false };
    }

    const existingByName = await employeeTypeRepository.findByBusinessAndName(
      businessId,
      template.name,
    );
    if (existingByName) {
      const fields = [
        ...(existingByName.sourceTemplateKey === template.key ? [] : ["sourceTemplateKey"]),
        ...(existingByName.status === "active" ? [] : ["status"]),
      ];
      if (!fields.length) return { employeeType: existingByName, created: false };
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        existingByName.id,
        { sourceTemplateKey: template.key, status: "active" },
      );
      if (employeeType) await recordAudit(businessId, requestedBy, employeeType, "business.employee_type.updated", fields);
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
    requestedBy?: string,
  ) => {
    if ("templateKey" in input) {
      const result = await resolveTemplate(businessId, input.templateKey, requestedBy);
      if (result.created && result.employeeType) {
        await recordAudit(businessId, requestedBy, result.employeeType, "business.employee_type.created", ["name", "status"]);
      }
      return result;
    }

    try {
      const employeeType = await employeeTypeRepository.createEmployeeType({
        businessId,
        name: input.name,
        description: input.description,
      });
      await recordAudit(businessId, requestedBy, employeeType, "business.employee_type.created", ["name", "description", "status"]);
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
    requestedBy,
  }: {
    businessId: string;
    employeeTypeId: string;
    updates: UpdateEmployeeTypeInput;
    requestedBy?: string;
  }) => {
    try {
      const existing = await employeeTypeRepository.findByBusinessAndId(businessId, employeeTypeId);
      if (!existing) throw createHttpError("Employee type not found in this business", 404);
      const fields = Object.keys(updates).filter((field) => String(existing.get(field) ?? "") !== String(updates[field as keyof UpdateEmployeeTypeInput] ?? ""));
      if (!fields.length) return { employeeType: existing };
      const employeeType = await employeeTypeRepository.updateByBusinessAndId(
        businessId,
        employeeTypeId,
        updates,
      );
      if (!employeeType) {
        throw createHttpError("Employee type not found in this business", 404);
      }
      await recordAudit(businessId, requestedBy, employeeType, "business.employee_type.updated", fields);
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
