import { z } from "zod";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid mongo id");
const empty = z.object({}).strict();
const businessParams = z.object({ businessId: objectId }).strict();
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const nullableDate = z.coerce.date().nullable().optional();
const effectiveDates = { effectiveFrom: nullableDate, effectiveTo: nullableDate };
const validDateRange = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.refine((raw) => {
  const value = raw as { effectiveFrom?: Date | null; effectiveTo?: Date | null };
  return !value.effectiveFrom || !value.effectiveTo || value.effectiveFrom < value.effectiveTo;
}, { message: "effectiveFrom must be before effectiveTo" });

const referenceValue = z.union([objectId, z.array(objectId).min(1).max(100)]);
const stateValue = z.union([z.string().trim().min(1).max(100), z.array(z.string().trim().min(1).max(100)).min(1).max(100)]);
const conditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("department"), operator: z.enum(["equals", "not_equals", "in", "not_in"]), value: referenceValue }).strict(),
  z.object({ field: z.literal("employeeType"), operator: z.enum(["equals", "not_equals", "in", "not_in"]), value: referenceValue }).strict(),
  z.object({ field: z.literal("group"), operator: z.enum(["contains", "not_contains", "in", "not_in"]), value: referenceValue }).strict(),
  z.object({ field: z.literal("state"), operator: z.enum(["equals", "not_equals", "in", "not_in"]), value: stateValue }).strict(),
  z.object({ field: z.literal("tenure"), operator: z.enum(["equals", "not_equals", "gte", "lte", "gt", "lt"]), value: z.number().nonnegative() }).strict(),
]);

export const listCategoriesSchema = z.object({ body: empty.optional(), params: businessParams, query: pagination.extend({ status: z.enum(["active", "archived"]).optional() }).strict() });
export const categoryParamsSchema = z.object({ body: empty.optional(), params: businessParams.extend({ categoryId: objectId }), query: empty });
export const createCategorySchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).nullable().optional(), cardinality: z.enum(["ONE", "MANY"]) }).strict(), params: businessParams, query: empty });
export const updateCategorySchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100).optional(), description: z.string().trim().max(1000).nullable().optional(), cardinality: z.enum(["ONE", "MANY"]).optional() }).strict().refine((body) => Object.keys(body).length > 0, "At least one field is required"), params: businessParams.extend({ categoryId: objectId }), query: empty });

export const listPoliciesSchema = z.object({ body: empty.optional(), params: businessParams, query: pagination.extend({ categoryId: objectId.optional(), status: z.enum(["draft", "active", "archived"]).optional() }).strict() });
export const policyParamsSchema = z.object({ body: empty.optional(), params: businessParams.extend({ policyId: objectId }), query: empty });
export const createPolicySchema = z.object({ body: validDateRange(z.object({ categoryId: objectId, name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000).nullable().optional(), configuration: z.record(z.string(), z.unknown()).optional(), ...effectiveDates }).strict()), params: businessParams, query: empty });
export const updatePolicySchema = z.object({ body: validDateRange(z.object({ categoryId: objectId.optional(), name: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(2000).nullable().optional(), configuration: z.record(z.string(), z.unknown()).optional(), ...effectiveDates }).strict()).refine((body) => Object.keys(body).length > 0, "At least one field is required"), params: businessParams.extend({ policyId: objectId }), query: empty });

export const listRulesSchema = z.object({ body: empty.optional(), params: businessParams.extend({ policyId: objectId }), query: empty });
export const ruleParamsSchema = z.object({ body: empty.optional(), params: businessParams.extend({ ruleId: objectId }), query: empty });
export const createRuleSchema = z.object({ body: validDateRange(z.object({ name: z.string().trim().min(2).max(120).optional(), conditions: z.array(conditionSchema).min(1).max(50), priority: z.number().int().min(0), ...effectiveDates }).strict()), params: businessParams.extend({ policyId: objectId }), query: empty });
export const updateRuleSchema = z.object({ body: validDateRange(z.object({ name: z.string().trim().min(2).max(120).nullable().optional(), conditions: z.array(conditionSchema).min(1).max(50).optional(), priority: z.number().int().min(0).optional(), ...effectiveDates }).strict()).refine((body) => Object.keys(body).length > 0, "At least one field is required"), params: businessParams.extend({ ruleId: objectId }), query: empty });

const employeePolicyParams = businessParams.extend({ employeeId: objectId });
export const employeePoliciesSchema = z.object({ body: empty.optional(), params: employeePolicyParams, query: z.object({ asOf: z.coerce.date().default(() => new Date()) }).strict() });
export const manualAssignmentSchema = z.object({ body: z.object({ effectiveFrom: z.coerce.date().default(() => new Date()) }).strict(), params: employeePolicyParams.extend({ policyId: objectId }), query: empty });
export const endManualAssignmentSchema = z.object({ body: z.object({ effectiveTo: z.coerce.date().default(() => new Date()) }).strict(), params: employeePolicyParams.extend({ policyId: objectId }), query: empty });
export const reconcileEmployeeSchema = z.object({ body: z.object({ reason: z.string().trim().min(2).max(500).default("manual_api_request") }).strict(), params: employeePolicyParams, query: empty });
export const reconcileBusinessSchema = z.object({ body: z.object({ reason: z.string().trim().min(2).max(500).default("manual_api_request") }).strict(), params: businessParams, query: empty });

export const listAuditSchema = z.object({ body: empty.optional(), params: businessParams, query: pagination.extend({ entityType: z.enum(["policy_category", "policy", "policy_rule", "employee_policy_assignment", "manual_assignment", "reconciliation"]).optional(), entityId: objectId.optional(), employeeId: objectId.optional(), policyId: objectId.optional(), ruleId: objectId.optional(), categoryId: objectId.optional(), actorUserId: objectId.optional(), action: z.string().trim().max(100).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict() });
const historyQuery = pagination.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict();
export const employeeHistorySchema = z.object({ body: empty.optional(), params: employeePolicyParams, query: historyQuery });
export const policyHistorySchema = z.object({ body: empty.optional(), params: businessParams.extend({ policyId: objectId }), query: historyQuery });
export const ruleHistorySchema = z.object({ body: empty.optional(), params: businessParams.extend({ ruleId: objectId }), query: historyQuery });
