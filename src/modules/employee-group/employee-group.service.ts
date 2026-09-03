import type { HttpError } from "../../utils/api-error.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { defaultEmployeeGroups } from "./employee-group.defaults.js";
import type { EmployeeGroupRepository } from "./employee-group.repository.js";
import type { AuditEventService } from "../audit-event/audit-event.service.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type {
  CreateEmployeeGroupInput,
  EmployeeGroupStatus,
  UpdateEmployeeGroupInput,
} from "./employee-group.types.js";

type CreateEmployeeGroupServiceDependencies = {
  employeeGroupRepository: EmployeeGroupRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
  auditEventService: AuditEventService;
  businessMemberRepository: BusinessMemberRepository;
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const createEmployeeGroupService = ({
  employeeGroupRepository,
  createHttpError,
  auditEventService,
  businessMemberRepository,
}: CreateEmployeeGroupServiceDependencies) => {
  const recordAudit = async (businessId: string, requestedBy: string | undefined, employeeGroup: { id: string; name: string; toObject?: () => Record<string, unknown> }, action: "business.employee_group.created" | "business.employee_group.updated", fields: string[] = []) => {
    const actor = requestedBy ? await businessMemberRepository.findActiveMembershipByBusinessAndUser(businessId, requestedBy).catch(() => null) : null;
    await auditEventService.recordEventSafely({
      eventType: action, category: "business", outcome: "success", businessId,
      actorBusinessMemberId: actor ? String(actor.id) : null,
      subjectType: "employee_group", subjectId: employeeGroup.id,
      userId: requestedBy ?? null, email: null,
      changes: fields.length ? { fields, before: {}, after: employeeGroup.toObject?.() ?? { name: employeeGroup.name } } : undefined,
    });
  };
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

  const resolveTemplate = async (businessId: string, templateKey: string, requestedBy?: string) => {
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
      if (existingByTemplate.status === "active") {
        return { employeeGroup: existingByTemplate, created: false };
      }
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          existingByTemplate.id,
          { status: "active" },
        );
      if (employeeGroup) await recordAudit(businessId, requestedBy, employeeGroup, "business.employee_group.updated", ["status"]);
      return { employeeGroup, created: false };
    }

    const existingByName = await employeeGroupRepository.findByBusinessAndName(
      businessId,
      template.name,
    );
    if (existingByName) {
      const fields = [
        ...(existingByName.sourceTemplateKey === template.key ? [] : ["sourceTemplateKey"]),
        ...(existingByName.status === "active" ? [] : ["status"]),
      ];
      if (!fields.length) return { employeeGroup: existingByName, created: false };
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          existingByName.id,
          { sourceTemplateKey: template.key, status: "active" },
        );
      if (employeeGroup) await recordAudit(businessId, requestedBy, employeeGroup, "business.employee_group.updated", fields);
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
    requestedBy?: string,
  ) => {
    if ("templateKey" in input) {
      const result = await resolveTemplate(businessId, input.templateKey, requestedBy);
      if (result.created && result.employeeGroup) {
        await recordAudit(businessId, requestedBy, result.employeeGroup, "business.employee_group.created", ["name", "status"]);
      }
      return result;
    }

    try {
      const employeeGroup = await employeeGroupRepository.createEmployeeGroup({
        businessId,
        name: input.name,
        description: input.description,
      });
      await recordAudit(businessId, requestedBy, employeeGroup, "business.employee_group.created", ["name", "description", "status"]);
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
    requestedBy,
  }: {
    businessId: string;
    employeeGroupId: string;
    updates: UpdateEmployeeGroupInput;
    requestedBy?: string;
  }) => {
    try {
      const existing = await employeeGroupRepository.findByBusinessAndId(businessId, employeeGroupId);
      if (!existing) throw createHttpError("Employee group not found in this business", 404);
      const fields = Object.keys(updates).filter((field) => String(existing.get(field) ?? "") !== String(updates[field as keyof UpdateEmployeeGroupInput] ?? ""));
      if (!fields.length) return { employeeGroup: existing };
      const employeeGroup =
        await employeeGroupRepository.updateByBusinessAndId(
          businessId,
          employeeGroupId,
          updates,
        );
      if (!employeeGroup) {
        throw createHttpError("Employee group not found in this business", 404);
      }
      await recordAudit(businessId, requestedBy, employeeGroup, "business.employee_group.updated", fields);
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
