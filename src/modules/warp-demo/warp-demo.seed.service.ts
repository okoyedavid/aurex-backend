import type { HttpError } from "../../utils/api-error.js";
import type { WarpDemoRepository } from "./warp-demo.repository.js";
import type { WarpDemoSeed } from "./warp-demo.types.js";
import {
  documentId,
  isoDate,
  normalizeCategory,
  normalizePolicy,
  normalizeRule,
  type WarpDemoDocument,
} from "./warp-demo.dto.js";

type Dependencies = {
  repository: WarpDemoRepository;
  businessId?: string;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export const createWarpDemoSeedService = ({
  repository,
  businessId,
  createHttpError,
}: Dependencies) => {
  const assertBusiness = async () => {
    if (!businessId) throw createHttpError("Warp demo is not configured", 503);
    const business = await repository.findBusiness(businessId);
    if (
      !business ||
      business.name !== "Northstar Labs" ||
      business.email !== "warp-demo@northstar.invalid"
    ) {
      throw createHttpError("Warp demo is temporarily unavailable", 503);
    }
    return business as WarpDemoDocument;
  };

  const dimensions = async () => {
    await assertBusiness();
    const [lists, types, groups] = await Promise.all([
      repository.listEmployeeLists(businessId!),
      repository.listEmployeeTypes(businessId!),
      repository.listEmployeeGroups(businessId!),
    ]);
    return {
      departments: new Map((lists as WarpDemoDocument[]).map((item) => [documentId(item._id), item.name])),
      employeeTypes: new Map((types as WarpDemoDocument[]).map((item) => [documentId(item._id), item.name])),
      groups: new Map((groups as WarpDemoDocument[]).map((item) => [documentId(item._id), item.name])),
    };
  };

  const loadSeed = async (): Promise<WarpDemoSeed> => {
    await assertBusiness();
    const [employee, lists, types, groups, categoryItems, policyItems, ruleItems] =
      await Promise.all([
        repository.findEmployeeByName(businessId!, "Maya Patel"),
        repository.listEmployeeLists(businessId!),
        repository.listEmployeeTypes(businessId!),
        repository.listEmployeeGroups(businessId!),
        repository.listCategories(businessId!),
        repository.listPolicies(businessId!),
        repository.listRules(businessId!),
      ]);
    if (!employee) throw createHttpError("The live demo is temporarily unavailable.", 503);
    const dimension = (item: WarpDemoDocument) => ({
      id: documentId(item._id),
      name: item.name,
      status: item.status ?? "active",
    });
    const value = employee as WarpDemoDocument;
    const seed: WarpDemoSeed = {
      businessId: businessId!,
      employee: {
        id: documentId(value._id),
        fullName: value.fullName,
        jobTitle: value.jobTitle ?? null,
        employeeListId: documentId(value.employeeListId),
        employeeTypeId: value.employeeTypeId ? documentId(value.employeeTypeId) : null,
        groupIds: (value.groupIds ?? []).map(documentId),
        state: value.state ?? null,
        status: value.status,
        employmentStartDate: isoDate(value.employmentStartDate),
      },
      departments: (lists as WarpDemoDocument[]).map(dimension),
      employeeTypes: (types as WarpDemoDocument[]).map(dimension),
      groups: (groups as WarpDemoDocument[]).map(dimension),
      categories: (categoryItems as WarpDemoDocument[]).map(normalizeCategory),
      policies: (policyItems as WarpDemoDocument[]).map(normalizePolicy),
      rules: (ruleItems as WarpDemoDocument[]).map(normalizeRule),
    };
    for (const required of [
      [seed.departments, "Engineering"],
      [seed.departments, "Finance"],
      [seed.employeeTypes, "Full Time"],
      [seed.employeeTypes, "Contractor"],
      [seed.groups, "Remote"],
    ] as const) {
      if (!required[0].some((item) => item.name === required[1])) {
        throw createHttpError("The live demo is temporarily unavailable.", 503);
      }
    }
    return seed;
  };

  return { assertBusiness, dimensions, loadSeed };
};

export type WarpDemoSeedService = ReturnType<typeof createWarpDemoSeedService>;
