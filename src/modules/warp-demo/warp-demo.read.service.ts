import type { HttpError } from "../../utils/api-error.js";
import type { PolicyResolver } from "../policy/policy-resolver.service.js";
import type { PolicyStatus } from "../policy/policy.model.js";
import type { WarpDemoRepository } from "./warp-demo.repository.js";
import type { WarpDemoSeedService } from "./warp-demo.seed.service.js";
import {
  auditDto,
  documentId,
  employeeDto,
  explanation,
  mapPolicies,
  normalizeCategory,
  normalizePolicy,
  type WarpDemoDocument,
} from "./warp-demo.dto.js";

type Dependencies = {
  repository: WarpDemoRepository;
  resolver: PolicyResolver;
  seedService: WarpDemoSeedService;
  businessId?: string;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export const createWarpDemoReadService = ({
  repository,
  resolver,
  seedService,
  businessId,
  createHttpError,
}: Dependencies) => {
  const getEmployee = async (employeeId: string) => {
    if (!businessId) throw createHttpError("Warp demo is not configured", 503);
    const [lookup, employee] = await Promise.all([
      seedService.dimensions(),
      repository.findEmployee(businessId, employeeId),
    ]);
    if (!employee) throw createHttpError("Demo employee not found", 404);
    return { employee: employee as WarpDemoDocument, lookup };
  };

  const overview = async () => {
    const business = await seedService.assertBusiness();
    const [employees, categories, policies, activeRules, activeAssignments] = await Promise.all([
      repository.listEmployees(businessId!),
      repository.listCategories(businessId!),
      repository.listPolicies(businessId!),
      repository.countActiveRules(businessId!),
      repository.countActiveAssignments(businessId!),
    ]);
    return {
      business: {
        name: business.name,
        description: "A fictional technology company used to demonstrate Aurex policy assignment.",
      },
      stats: {
        employees: employees.length,
        policyCategories: categories.length,
        policies: policies.length,
        activeRules,
        activeAssignments,
      },
      concepts: { employeeDimensions: ["department", "employeeType", "group", "state", "tenure"] },
      cardinalityModel: "ONE_OR_MANY",
    };
  };

  const employees = async () => {
    const lookup = await seedService.dimensions();
    const [items, assignments] = await Promise.all([
      repository.listEmployees(businessId!),
      repository.listActiveAssignments(businessId!),
    ]);
    const counts = new Map<string, number>();
    for (const assignment of assignments as WarpDemoDocument[]) {
      const key = documentId(assignment.employeeId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      employees: (items as WarpDemoDocument[]).map((item) => ({
        ...employeeDto(item, lookup),
        resolvedPolicyCount: counts.get(documentId(item._id)) ?? 0,
      })),
    };
  };

  const employee = async (employeeId: string) => {
    const result = await getEmployee(employeeId);
    return employeeDto(result.employee, result.lookup);
  };

  const categories = async () => {
    await seedService.assertBusiness();
    const [items, policyItems] = await Promise.all([
      repository.listCategories(businessId!),
      repository.listPolicies(businessId!),
    ]);
    return {
      categories: (items as WarpDemoDocument[]).map((item) => ({
        id: documentId(item._id),
        name: item.name,
        description: item.description ?? null,
        cardinality: item.cardinality,
        maxAssignments: item.cardinality === "ONE" ? 1 : null,
        policyCount: (policyItems as WarpDemoDocument[]).filter(
          (policy) => documentId(policy.categoryId) === documentId(item._id),
        ).length,
      })),
    };
  };

  const policies = async (filters: { categoryId?: string; status?: PolicyStatus }) => {
    await seedService.assertBusiness();
    const [items, categoryItems] = await Promise.all([
      repository.listPolicies(businessId!, filters),
      repository.listCategories(businessId!),
    ]);
    const byId = new Map((categoryItems as WarpDemoDocument[]).map((item) => [documentId(item._id), item]));
    return {
      policies: (items as WarpDemoDocument[]).map((item) => {
        const category = byId.get(documentId(item.categoryId));
        return {
          id: documentId(item._id), name: item.name, description: item.description ?? null,
          category: category ? {
            id: documentId(category._id), name: category.name, cardinality: category.cardinality,
            maxAssignments: category.cardinality === "ONE" ? 1 : null,
          } : null,
          status: item.status, version: item.version,
          effectiveFrom: item.effectiveFrom?.toISOString?.() ?? null,
          effectiveTo: item.effectiveTo?.toISOString?.() ?? null,
        };
      }),
    };
  };

  const policy = async (policyId: string) => {
    if (!businessId) throw createHttpError("Warp demo is not configured", 503);
    const item = await repository.findPolicy(businessId, policyId);
    if (!item) throw createHttpError("Demo policy not found", 404);
    const [categoryItems, rules] = await Promise.all([
      repository.listCategories(businessId), repository.listRules(businessId, [policyId]),
    ]);
    const value = item as WarpDemoDocument;
    const category = (categoryItems as WarpDemoDocument[]).find(
      (candidate) => documentId(candidate._id) === documentId(value.categoryId),
    );
    return {
      id: documentId(value._id), name: value.name, description: value.description ?? null,
      category: category ? { id: documentId(category._id), name: category.name, cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null } : null,
      status: value.status, version: value.version,
      effectiveFrom: value.effectiveFrom?.toISOString?.() ?? null,
      effectiveTo: value.effectiveTo?.toISOString?.() ?? null,
      rules: (rules as WarpDemoDocument[]).map((rule) => ({ id: documentId(rule._id), name: rule.name ?? null, priority: rule.priority, status: rule.status, conditions: rule.conditions })),
    };
  };

  const employeePolicies = async (employeeId: string) => {
    const { employee: raw, lookup } = await getEmployee(employeeId);
    const [assignments, policyItems, categoryItems, rules] = await Promise.all([
      repository.listActiveAssignments(businessId!, employeeId), repository.listPolicies(businessId!),
      repository.listCategories(businessId!), repository.listRules(businessId!),
    ]);
    return mapPolicies(employeeDto(raw, lookup), assignments as WarpDemoDocument[], policyItems as WarpDemoDocument[], categoryItems as WarpDemoDocument[], rules as WarpDemoDocument[]);
  };

  const explain = async (employeeId: string) => {
    const { employee: raw, lookup } = await getEmployee(employeeId);
    const resolution = await resolver.resolvePoliciesForEmployee({ businessId: businessId!, employeeId, asOfDate: new Date() });
    const [policyItems, categoryItems] = await Promise.all([
      repository.listPolicies(businessId!), repository.listCategories(businessId!),
    ]);
    return explanation(employeeDto(raw, lookup), resolution, (policyItems as WarpDemoDocument[]).map(normalizePolicy), (categoryItems as WarpDemoDocument[]).map(normalizeCategory));
  };

  const audit = async (filters: { limit: number; employeeId?: string; policyId?: string; action?: string }) => {
    await seedService.assertBusiness();
    const [events, employeeItems, policyItems] = await Promise.all([
      repository.listAudit(businessId!, filters), repository.listEmployees(businessId!), repository.listPolicies(businessId!),
    ]);
    const employeeNames = new Map((employeeItems as WarpDemoDocument[]).map((item) => [documentId(item._id), item.fullName]));
    const policyNames = new Map((policyItems as WarpDemoDocument[]).map((item) => [documentId(item._id), item.name]));
    return { events: (events as WarpDemoDocument[]).map((event) => auditDto(event, employeeNames.get(documentId(event.employeeId)), policyNames.get(documentId(event.policyId)))) };
  };

  return { overview, employees, employee, categories, policies, policy, employeePolicies, explain, audit };
};

export type WarpDemoReadService = ReturnType<typeof createWarpDemoReadService>;
