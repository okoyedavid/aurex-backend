import type { ClientSession, UpdateQuery } from "mongoose";
import { PolicyCategory } from "../policy-category/policy-category.model.js";
import { PolicyRule } from "../policy-rule/policy-rule.model.js";
import { EmployeePolicyAssignment } from "../employee-policy-assignment/employee-policy-assignment.model.js";
import { Policy } from "./policy.model.js";

type Options = { session?: ClientSession };

const effectiveAt = (date: Date) => ({
  $and: [
    { $or: [{ effectiveFrom: null }, { effectiveFrom: { $exists: false } }, { effectiveFrom: { $lte: date } }] },
    { $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gt: date } }] },
  ],
});

const createCategory = (payload: Record<string, unknown>, { session }: Options = {}) =>
  PolicyCategory.create([payload], { session }).then(([item]) => item!);
const findCategory = (businessId: string, categoryId: string, { session }: Options = {}) =>
  PolicyCategory.findOne({ _id: categoryId, businessId }).session(session ?? null);
const listCategories = async (businessId: string, page: number, limit: number, status?: string) => {
  const filter: Record<string, unknown> = { businessId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    PolicyCategory.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PolicyCategory.countDocuments(filter),
  ]);
  return { items, total };
};
const updateCategory = (businessId: string, categoryId: string, updates: UpdateQuery<unknown>, { session }: Options = {}) =>
  PolicyCategory.findOneAndUpdate({ _id: categoryId, businessId }, updates, { returnDocument: "after", runValidators: true, session });

const createPolicy = (payload: Record<string, unknown>, { session }: Options = {}) =>
  Policy.create([payload], { session }).then(([item]) => item!);
const findPolicy = (businessId: string, policyId: string, { session }: Options = {}) =>
  Policy.findOne({ _id: policyId, businessId }).session(session ?? null);
const listPolicies = async (businessId: string, page: number, limit: number, categoryId?: string, status?: string) => {
  const filter: Record<string, unknown> = { businessId, ...(categoryId ? { categoryId } : {}), ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    Policy.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Policy.countDocuments(filter),
  ]);
  return { items, total };
};
const updatePolicy = (businessId: string, policyId: string, updates: UpdateQuery<unknown>, { session }: Options = {}) =>
  Policy.findOneAndUpdate({ _id: policyId, businessId }, updates, { returnDocument: "after", runValidators: true, session });
const findEffectivePolicies = (businessId: string, policyIds: string[], asOf: Date) =>
  Policy.find({ businessId, _id: { $in: policyIds }, status: "active", ...effectiveAt(asOf) });

const createRule = (payload: Record<string, unknown>, { session }: Options = {}) =>
  PolicyRule.create([payload], { session }).then(([item]) => item!);
const findRule = (businessId: string, ruleId: string, { session }: Options = {}) =>
  PolicyRule.findOne({ _id: ruleId, businessId }).session(session ?? null);
const listRules = (businessId: string, policyId: string) =>
  PolicyRule.find({ businessId, policyId }).sort({ priority: -1, _id: 1 });
const updateRule = (businessId: string, ruleId: string, updates: UpdateQuery<unknown>, { session }: Options = {}) =>
  PolicyRule.findOneAndUpdate({ _id: ruleId, businessId }, updates, { returnDocument: "after", runValidators: true, session });
const findEffectiveRules = (businessId: string, asOf: Date) =>
  PolicyRule.find({ businessId, status: "active", ...effectiveAt(asOf) }).sort({ priority: -1, _id: 1 });

const findActiveAssignments = (businessId: string, employeeId: string, { session }: Options = {}) =>
  EmployeePolicyAssignment.find({ businessId, employeeId, status: "active" }).session(session ?? null);
const findAssignmentsAsOf = (businessId: string, employeeId: string, asOf: Date, { session }: Options = {}) =>
  EmployeePolicyAssignment.find({
    businessId,
    employeeId,
    effectiveFrom: { $lte: asOf },
    $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gt: asOf } }],
  }).sort({ effectiveFrom: -1 }).session(session ?? null);
const createAssignment = (payload: Record<string, unknown>, { session }: Options = {}) =>
  EmployeePolicyAssignment.create([payload], { session }).then(([item]) => item!);
const updateAssignment = (assignmentId: string, updates: UpdateQuery<unknown>, { session }: Options = {}) =>
  EmployeePolicyAssignment.findByIdAndUpdate(assignmentId, updates, { returnDocument: "after", runValidators: true, session });
const findActiveManualAssignment = (businessId: string, employeeId: string, policyId: string) =>
  EmployeePolicyAssignment.findOne({ businessId, employeeId, policyId, source: "manual", status: "active" });
const countAssignmentsForCategory = (businessId: string, categoryId: string) =>
  EmployeePolicyAssignment.countDocuments({ businessId, categoryId });

export const policyRepository = {
  countAssignmentsForCategory,
  createAssignment,
  createCategory,
  createPolicy,
  createRule,
  findActiveAssignments,
  findActiveManualAssignment,
  findAssignmentsAsOf,
  findCategory,
  findEffectivePolicies,
  findEffectiveRules,
  findPolicy,
  findRule,
  listCategories,
  listPolicies,
  listRules,
  updateAssignment,
  updateCategory,
  updatePolicy,
  updateRule,
};

export type PolicyRepository = typeof policyRepository;
