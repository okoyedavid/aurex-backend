import crypto from "node:crypto";
import { calculateTenureMonths } from "../policy-rule/rule-evaluator.js";
import type { PolicyResolver } from "../policy/policy-resolver.service.js";
import type { WarpDemoRepository } from "./warp-demo.repository.js";
import type { HttpError } from "../../utils/api-error.js";
import type { PolicyStatus } from "../policy/policy.model.js";
import type { EmployeeService } from "../employee/employee.service.js";
import type { PolicyReconciliationJob } from "../../queues/policy-reconciliation.types.js";
import type { WarpDemoProgressService } from "./warp-demo-progress.service.js";
import { WarpDemoBusyError, WarpDemoMutationLimitError, WarpDemoRunConflictError, WarpDemoSessionExpiredError, type WarpDemoSessionStore } from "./warp-demo-session.store.js";
import type { WarpDemoMutation } from "./warp-demo.validators.js";

type Dependencies = {
  repository: WarpDemoRepository;
  resolver: PolicyResolver;
  businessId?: string;
  createHttpError: (message: string, statusCode: number) => HttpError;
  employeeService: EmployeeService;
  sessionStore: WarpDemoSessionStore;
  progressService: WarpDemoProgressService;
  enqueueReconciliation: (job: PolicyReconciliationJob) => Promise<unknown>;
};

type Doc = Record<string, any>;
const id = (value: unknown) => String(value);
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : null;

export const createWarpDemoService = ({ repository, resolver, businessId, createHttpError, employeeService, sessionStore, progressService, enqueueReconciliation }: Dependencies) => {
  const configuredBusiness = async () => {
    if (!businessId) throw createHttpError("Warp demo is not configured", 503);
    const business = await repository.findBusiness(businessId);
    if (!business) throw createHttpError("Warp demo is temporarily unavailable", 503);
    if (business.name !== "Northstar Labs" || business.email !== "warp-demo@northstar.invalid") {
      throw createHttpError("Warp demo is temporarily unavailable", 503);
    }
    return business as Doc;
  };

  const dimensions = async () => {
    await configuredBusiness();
    const [lists, types, groups] = await Promise.all([
      repository.listEmployeeLists(businessId!),
      repository.listEmployeeTypes(businessId!),
      repository.listEmployeeGroups(businessId!),
    ]);
    return {
      departments: new Map((lists as Doc[]).map((item) => [id(item._id), item.name])),
      employeeTypes: new Map((types as Doc[]).map((item) => [id(item._id), item.name])),
      groups: new Map((groups as Doc[]).map((item) => [id(item._id), item.name])),
    };
  };

  const employeeDto = (employee: Doc, lookup: Awaited<ReturnType<typeof dimensions>>, now = new Date()) => ({
    id: id(employee._id),
    name: employee.fullName,
    jobTitle: employee.jobTitle ?? null,
    department: lookup.departments.get(id(employee.employeeListId)) ?? "Unknown",
    employeeType: employee.employeeTypeId ? lookup.employeeTypes.get(id(employee.employeeTypeId)) ?? "Unknown" : null,
    state: employee.state ?? null,
    employmentStartDate: iso(employee.employmentStartDate),
    tenureMonths: calculateTenureMonths(employee.employmentStartDate ?? null, now),
    groups: (employee.groupIds ?? []).map((groupId: unknown) => lookup.groups.get(id(groupId))).filter(Boolean),
  });

  const getEmployee = async (employeeId: string) => {
    const [lookup, employee] = await Promise.all([
      dimensions(),
      businessId ? repository.findEmployee(businessId, employeeId) : Promise.resolve(null),
    ]);
    if (!employee) throw createHttpError("Demo employee not found", 404);
    return { employee: employee as Doc, lookup, dto: employeeDto(employee as Doc, lookup) };
  };

  const overview = async () => {
    const business = await configuredBusiness();
    const [employees, categories, policies, activeRules, activeAssignments] = await Promise.all([
      repository.listEmployees(businessId!), repository.listCategories(businessId!),
      repository.listPolicies(businessId!), repository.countActiveRules(businessId!),
      repository.countActiveAssignments(businessId!),
    ]);
    return {
      business: { name: business.name, description: "A fictional technology company used to demonstrate Aurex policy assignment." },
      stats: { employees: employees.length, policyCategories: categories.length, policies: policies.length, activeRules, activeAssignments },
      concepts: { employeeDimensions: ["department", "employeeType", "group", "state", "tenure"] },
      cardinalityModel: "ONE_OR_MANY",
    };
  };

  const employees = async () => {
    const lookup = await dimensions();
    const [items, assignments] = await Promise.all([
      repository.listEmployees(businessId!), repository.listActiveAssignments(businessId!),
    ]);
    const counts = new Map<string, number>();
    for (const assignment of assignments as Doc[]) counts.set(id(assignment.employeeId), (counts.get(id(assignment.employeeId)) ?? 0) + 1);
    return { employees: (items as Doc[]).map((employee) => ({ ...employeeDto(employee, lookup), resolvedPolicyCount: counts.get(id(employee._id)) ?? 0 })) };
  };

  const employee = async (employeeId: string) => (await getEmployee(employeeId)).dto;

  const categories = async () => {
    await configuredBusiness();
    const [items, policies] = await Promise.all([repository.listCategories(businessId!), repository.listPolicies(businessId!)]);
    return { categories: (items as Doc[]).map((category) => ({
      id: id(category._id), name: category.name, description: category.description ?? null,
      cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null,
      policyCount: (policies as Doc[]).filter((policy) => id(policy.categoryId) === id(category._id)).length,
    })) };
  };

  const policies = async (filters: { categoryId?: string; status?: PolicyStatus }) => {
    await configuredBusiness();
    const [items, categoryItems] = await Promise.all([repository.listPolicies(businessId!, filters), repository.listCategories(businessId!)]);
    if (filters.categoryId && !(categoryItems as Doc[]).some((item) => id(item._id) === filters.categoryId)) throw createHttpError("Demo policy category not found", 404);
    const rules = await repository.listRules(businessId!, (items as Doc[]).map((item) => id(item._id)));
    const categoryById = new Map((categoryItems as Doc[]).map((item) => [id(item._id), item]));
    return { policies: (items as Doc[]).map((policy) => ({
      id: id(policy._id), name: policy.name, description: policy.description ?? null,
      category: (() => { const category = categoryById.get(id(policy.categoryId)); return category ? { id: id(category._id), name: category.name, cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null } : null; })(),
      status: policy.status, version: policy.version, effectiveFrom: iso(policy.effectiveFrom), effectiveTo: iso(policy.effectiveTo),
      ruleCount: (rules as Doc[]).filter((rule) => id(rule.policyId) === id(policy._id)).length,
    })) };
  };

  const policy = async (policyId: string) => {
    await configuredBusiness();
    const item = await repository.findPolicy(businessId!, policyId);
    if (!item) throw createHttpError("Demo policy not found", 404);
    const [categoryItems, rules] = await Promise.all([repository.listCategories(businessId!), repository.listRules(businessId!, [policyId])]);
    const value = item as Doc;
    const category = (categoryItems as Doc[]).find((candidate) => id(candidate._id) === id(value.categoryId));
    return {
      id: id(value._id), name: value.name, description: value.description ?? null,
      category: category ? { id: id(category._id), name: category.name, cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null } : null,
      status: value.status, version: value.version, effectiveFrom: iso(value.effectiveFrom), effectiveTo: iso(value.effectiveTo),
      rules: (rules as Doc[]).map((rule) => ({ id: id(rule._id), name: rule.name ?? null, priority: rule.priority, status: rule.status, conditions: rule.conditions.map((condition: Doc) => ({ field: condition.field, operator: condition.operator, value: condition.value })) })),
    };
  };

  const employeePolicies = async (employeeId: string) => {
    const { dto } = await getEmployee(employeeId);
    const [assignments, policyItems, categoryItems, rules] = await Promise.all([
      repository.listActiveAssignments(businessId!, employeeId), repository.listPolicies(businessId!),
      repository.listCategories(businessId!), repository.listRules(businessId!),
    ]);
    const policyById = new Map((policyItems as Doc[]).map((item) => [id(item._id), item]));
    const categoryById = new Map((categoryItems as Doc[]).map((item) => [id(item._id), item]));
    const ruleById = new Map((rules as Doc[]).map((item) => [id(item._id), item]));
    return { employee: dto, policies: (assignments as Doc[]).flatMap((assignment) => {
      const assignedPolicy = policyById.get(id(assignment.policyId));
      const category = categoryById.get(id(assignment.categoryId));
      if (!assignedPolicy || !category) return [];
      const rule = assignment.winningRuleId ? ruleById.get(id(assignment.winningRuleId)) : null;
      return [{ id: id(assignedPolicy._id), name: assignedPolicy.name, category: { id: id(category._id), name: category.name, cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null }, source: assignment.source, priority: rule?.priority ?? null, effectiveFrom: iso(assignment.effectiveFrom), effectiveTo: iso(assignment.effectiveTo), winningRuleName: rule?.name ?? null }];
    }) };
  };

  const explain = async (employeeId: string) => {
    const { dto, lookup } = await getEmployee(employeeId);
    const resolution = await resolver.resolvePoliciesForEmployee({ businessId: businessId!, employeeId, asOfDate: new Date() });
    const [policyItems, categoryItems, ruleItems] = await Promise.all([repository.listPolicies(businessId!), repository.listCategories(businessId!), repository.listRules(businessId!)]);
    const policyById = new Map((policyItems as Doc[]).map((item) => [id(item._id), item]));
    const categoryById = new Map((categoryItems as Doc[]).map((item) => [id(item._id), item]));
    const ruleById = new Map((ruleItems as Doc[]).map((item) => [id(item._id), item]));
    const selected = new Set(resolution.desiredPolicies.map((item) => item.policyId));
    const suppressed = new Map(resolution.suppressedCandidates.map((item) => [item.policyId, item.reason]));
    const displayValue = (field: string, value: unknown) => {
      const map = field === "department" ? lookup.departments : field === "employeeType" ? lookup.employeeTypes : field === "group" ? lookup.groups : null;
      if (!map) return value;
      return Array.isArray(value) ? value.map((entry) => map.get(id(entry)) ?? id(entry)) : map.get(id(value)) ?? value;
    };
    const grouped = new Map<string, Doc[]>();
    for (const evaluated of resolution.evaluatedRules) {
      const current = grouped.get(evaluated.policyId) ?? [];
      current.push(evaluated);
      grouped.set(evaluated.policyId, current);
    }
    return { employee: dto, evaluationDate: resolution.evaluationDate.toISOString(), categories: (categoryItems as Doc[]).map((category) => {
      const categoryPolicies = (policyItems as Doc[]).filter((item) => id(item.categoryId) === id(category._id));
      const candidates = categoryPolicies.flatMap((item) => {
        const evaluations = grouped.get(id(item._id)) ?? [];
        if (!evaluations.length) return [];
        const matchedRules = evaluations.filter((evaluation) => evaluation.matched).map((evaluation) => ({
          ruleId: evaluation.ruleId, ruleName: ruleById.get(evaluation.ruleId)?.name ?? null, priority: evaluation.priority,
          conditions: evaluation.conditions.map((entry: Doc) => ({ field: entry.condition.field, operator: entry.condition.operator, expectedValue: displayValue(entry.condition.field, entry.condition.value), actualValue: displayValue(entry.condition.field, entry.actualValue), matched: entry.matched })),
        }));
        return [{ policyId: id(item._id), policyName: item.name, matched: matchedRules.length > 0, priority: matchedRules.length ? Math.max(...matchedRules.map((rule) => rule.priority)) : Math.max(...evaluations.map((rule) => rule.priority)), selected: selected.has(id(item._id)), source: "rule", matchedRules, suppressedReason: suppressed.has(id(item._id)) ? "cardinality_limit" : null }];
      });
      return { category: { id: id(category._id), name: category.name, cardinality: category.cardinality, maxAssignments: category.cardinality === "ONE" ? 1 : null }, candidates, selectedPolicies: candidates.filter((candidate) => candidate.selected).map((candidate) => ({ id: candidate.policyId, name: candidate.policyName })) };
    }) };
  };

  const audit = async (filters: { limit: number; employeeId?: string; policyId?: string; action?: string }) => {
    await configuredBusiness();
    if (filters.employeeId && !await repository.findEmployee(businessId!, filters.employeeId)) throw createHttpError("Demo employee not found", 404);
    if (filters.policyId && !await repository.findPolicy(businessId!, filters.policyId)) throw createHttpError("Demo policy not found", 404);
    const [events, employees, policies, categories] = await Promise.all([repository.listAudit(businessId!, filters), repository.listEmployees(businessId!), repository.listPolicies(businessId!), repository.listCategories(businessId!)]);
    const names = (items: Doc[], property: string) => new Map(items.map((item) => [id(item._id), item[property]]));
    const employeeNames = names(employees as Doc[], "fullName"); const policyNames = names(policies as Doc[], "name"); const categoryNames = names(categories as Doc[], "name");
    return { events: (events as Doc[]).map((event) => {
      const employeeName = event.employeeId ? employeeNames.get(id(event.employeeId)) : undefined;
      const policyName = event.policyId ? policyNames.get(id(event.policyId)) : undefined;
      const categoryName = event.categoryId ? categoryNames.get(id(event.categoryId)) : undefined;
      return { id: id(event._id), timestamp: iso(event.occurredAt), entityType: event.entityType, action: event.action, ...(employeeName ? { employeeName } : {}), ...(policyName ? { policyName } : {}), ...(categoryName ? { categoryName } : {}), actor: { type: event.actorType, displayName: event.actorType === "user" ? "Demo administrator" : "Aurex policy engine" }, summary: [event.action.replaceAll("_", " ").toLowerCase(), policyName, employeeName ? `for ${employeeName}` : null].filter(Boolean).join(" "), ...(event.reason ? { reason: event.reason } : {}) };
    }) };
  };

  const publicEmployee = (value: ReturnType<typeof employeeDto>) => {
    const { id: _internalId, ...safe } = value;
    return { alias: "maya" as const, ...safe };
  };

  const requireMutableDemo = async () => {
    await configuredBusiness();
    const [connection, managedGrantCount] = await Promise.all([
      repository.findGitHubConnection(businessId!),
      repository.countManagedExternalGrants(businessId!),
    ]);
    if ((connection?.status === "active" && connection.installationId) || managedGrantCount > 0) {
      throw createHttpError("The live demo is temporarily unavailable.", 503);
    }
  };

  const scenario = async () => {
    await requireMutableDemo();
    const [employee, lists, types, groups] = await Promise.all([
      repository.findEmployeeByName(businessId!, "Maya Patel"),
      repository.listEmployeeLists(businessId!),
      repository.listEmployeeTypes(businessId!),
      repository.listEmployeeGroups(businessId!),
    ]);
    const byName = (items: Doc[]) => new Map(items.map((item) => [item.name, id(item._id)]));
    const departments = byName(lists as Doc[]);
    const employeeTypes = byName(types as Doc[]);
    const groupIds = byName(groups as Doc[]);
    if (!employee || !departments.has("Engineering") || !departments.has("Finance") || !employeeTypes.has("Full Time") || !employeeTypes.has("Contractor") || !groupIds.has("Remote")) {
      throw createHttpError("The live demo is temporarily unavailable.", 503);
    }
    return { employee: employee as Doc, departments, employeeTypes, remoteGroupId: groupIds.get("Remote")! };
  };

  const publicSessionError = (error: unknown): never => {
    if (error instanceof WarpDemoSessionExpiredError) throw createHttpError(error.message, 410);
    if (error instanceof WarpDemoRunConflictError) throw createHttpError(error.message, 409);
    if (error instanceof WarpDemoMutationLimitError) throw createHttpError(error.message, 429);
    if (error instanceof WarpDemoBusyError) throw createHttpError(error.message, 423);
    throw error;
  };

  const queueScenarioChange = async ({ sessionId, updates, description, reason, countMutation }: { sessionId: string; updates: Record<string, unknown>; description: string; reason: string; countMutation: boolean }) => {
    const runId = crypto.randomUUID();
    try {
      await sessionStore.claimRun(sessionId, runId, countMutation);
    } catch (error) {
      return publicSessionError(error);
    }
    try {
      await progressService.createRun({ runId, sessionId });
      const current = await scenario();
      const comparable = (value: unknown) => Array.isArray(value) ? value.map(id).sort() : value === null || value === undefined ? value : id(value);
      const employeeChanged = Object.entries(updates).some(([field, value]) => JSON.stringify(comparable(current.employee[field])) !== JSON.stringify(comparable(value)));
      await employeeService.updateBusinessEmployee({ businessId: businessId!, employeeId: id(current.employee._id), updates, deferPolicyReconciliation: true });
      await progressService.appendEvent(runId, { stage: "employee_update", status: "success", title: employeeChanged ? "Employee updated" : "Employee already at requested state", description: employeeChanged ? description : "The employee facts already matched the requested demo state." }, "employee-updated");
      await progressService.appendEvent(runId, { stage: "queued", status: "pending", title: "Reconciliation queued", description: "The real Aurex policy reconciliation pipeline will process this change." }, "queued");
      const queued = await enqueueReconciliation({
        type: "RECONCILE_EMPLOYEE",
        businessId: businessId!,
        employeeId: id(current.employee._id),
        reason: `warp_demo.${reason}`,
        requestedAt: new Date().toISOString(),
        correlationId: runId,
        demoRun: { runId, sessionId, employeeChanged, suppressExternalExecution: true },
      });
      if (!queued) throw new Error("Demo reconciliation queue is unavailable");
      return { runId, status: "queued" as const };
    } catch (error) {
      console.error("Warp demo reconciliation could not be queued", { runId, error: error instanceof Error ? error.message : "unknown" });
      await progressService.appendEvent(runId, { stage: "complete", status: "failed", title: "Reconciliation could not be completed", description: "Reset the demo scenario and try again." }, "run-failed").catch(() => undefined);
      await progressService.markFailed(runId).catch(() => undefined);
      await sessionStore.finishRun(sessionId, runId).catch(() => undefined);
      throw createHttpError("Reconciliation could not be started. Reset the scenario and try again.", 503);
    }
  };

  const baselineUpdates = async () => {
    const current = await scenario();
    return {
      employeeListId: current.departments.get("Engineering")!,
      employeeTypeId: current.employeeTypes.get("Full Time")!,
      state: "California",
      groupIds: [current.remoteGroupId],
    };
  };

  const createSession = async () => {
    await requireMutableDemo();
    let session;
    try { session = await sessionStore.createSession(); }
    catch (error) { return publicSessionError(error); }
    try {
      const initialization = await queueScenarioChange({ sessionId: session.id, updates: await baselineUpdates(), description: "Maya Patel was reset to Engineering, Full Time, California, with Remote membership.", reason: "session_initialized", countMutation: false });
      const current = await scenario();
      const lookup = await dimensions();
      const refreshed = await repository.findEmployee(businessId!, id(current.employee._id));
      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        employee: publicEmployee(employeeDto(refreshed as Doc, lookup)),
        initialization,
        controls: {
          department: ["engineering", "finance"],
          employeeType: ["full_time", "contractor"],
          state: ["california", "new_york"],
          remoteGroup: ["member", "not_member"],
        },
      };
    } catch (error) {
      await sessionStore.closeSession(session.id).catch(() => undefined);
      throw error;
    }
  };

  const mutate = async (sessionId: string, mutation: WarpDemoMutation) => {
    try { await sessionStore.getSession(sessionId); }
    catch (error) { return publicSessionError(error); }
    const current = await scenario();
    const lookup = await dimensions();
    const before = employeeDto(current.employee, lookup);
    let updates: Record<string, unknown>;
    let description: string;
    if (mutation.field === "department") {
      const name = mutation.value === "engineering" ? "Engineering" : "Finance";
      updates = { employeeListId: current.departments.get(name)! };
      description = `Department changed from ${before.department} to ${name}.`;
    } else if (mutation.field === "employeeType") {
      const name = mutation.value === "full_time" ? "Full Time" : "Contractor";
      updates = { employeeTypeId: current.employeeTypes.get(name)! };
      description = `Employee type changed from ${before.employeeType ?? "Unassigned"} to ${name}.`;
    } else if (mutation.field === "state") {
      const name = mutation.value === "california" ? "California" : "New York";
      updates = { state: name };
      description = `State changed from ${before.state ?? "Unassigned"} to ${name}.`;
    } else {
      const existing = (current.employee.groupIds ?? []).map(id).filter((groupId: string) => groupId !== current.remoteGroupId);
      const member = mutation.value === "member";
      updates = { groupIds: member ? [...existing, current.remoteGroupId] : existing };
      description = member ? "Maya Patel joined the Remote group." : "Maya Patel left the Remote group.";
    }
    return queueScenarioChange({ sessionId, updates, description, reason: `${mutation.field}_changed`, countMutation: true });
  };

  const reset = async (sessionId: string) => {
    try { await sessionStore.getSession(sessionId); }
    catch (error) { return publicSessionError(error); }
    const run = await queueScenarioChange({ sessionId, updates: await baselineUpdates(), description: "Maya Patel was reset to Engineering, Full Time, California, with Remote membership.", reason: "reset", countMutation: true });
    const current = await scenario();
    const lookup = await dimensions();
    return { ...run, employee: publicEmployee(employeeDto(current.employee, lookup)) };
  };

  const reconciliationRun = async (sessionId: string, runId: string) => {
    try { await sessionStore.getSession(sessionId); }
    catch (error) { return publicSessionError(error); }
    const run = await progressService.getRun(sessionId, runId);
    if (!run) throw createHttpError("Reconciliation run not found.", 404);
    return run;
  };

  return { overview, employees, employee, employeePolicies, explain, categories, policies, policy, audit, createSession, mutate, reconciliationRun, reset };
};

export type WarpDemoService = ReturnType<typeof createWarpDemoService>;
