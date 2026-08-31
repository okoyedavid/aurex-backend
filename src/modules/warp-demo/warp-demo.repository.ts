import { Business } from "../business/business.model.js";
import { Employee } from "../employee/employee.model.js";
import { EmployeeList } from "../employee-list/employee-list.model.js";
import { EmployeeType } from "../employee-type/employee-type.model.js";
import { EmployeeGroup } from "../employee-group/employee-group.model.js";
import { PolicyCategory } from "../policy-category/policy-category.model.js";
import { Policy } from "../policy/policy.model.js";
import type { PolicyStatus } from "../policy/policy.model.js";
import { PolicyRule } from "../policy-rule/policy-rule.model.js";
import { EmployeePolicyAssignment } from "../employee-policy-assignment/employee-policy-assignment.model.js";
import { PolicyAudit } from "../policy-audit/policy-audit.model.js";

export const warpDemoRepository = {
  findBusiness: (businessId: string) => Business.findById(businessId).lean(),
  listEmployees: (businessId: string) => Employee.find({ businessId, status: { $ne: "archived" } }).sort({ fullName: 1 }).lean(),
  findEmployee: (businessId: string, employeeId: string) => Employee.findOne({ _id: employeeId, businessId, status: { $ne: "archived" } }).lean(),
  listEmployeeLists: (businessId: string) => EmployeeList.find({ businessId }).lean(),
  listEmployeeTypes: (businessId: string) => EmployeeType.find({ businessId }).lean(),
  listEmployeeGroups: (businessId: string) => EmployeeGroup.find({ businessId }).lean(),
  listCategories: (businessId: string) => PolicyCategory.find({ businessId }).sort({ name: 1 }).lean(),
  listPolicies: (businessId: string, filters: { categoryId?: string; status?: PolicyStatus } = {}) => Policy.find({ businessId, ...(filters.categoryId ? { categoryId: filters.categoryId } : {}), ...(filters.status ? { status: filters.status } : {}) }).sort({ name: 1 }).lean(),
  findPolicy: (businessId: string, policyId: string) => Policy.findOne({ _id: policyId, businessId }).lean(),
  listRules: (businessId: string, policyIds?: string[]) => PolicyRule.find({ businessId, ...(policyIds ? { policyId: { $in: policyIds } } : {}) }).sort({ priority: -1, _id: 1 }).lean(),
  listActiveAssignments: (businessId: string, employeeId?: string) => EmployeePolicyAssignment.find({ businessId, status: "active", ...(employeeId ? { employeeId } : {}) }).lean(),
  countActiveRules: (businessId: string) => PolicyRule.countDocuments({ businessId, status: "active" }),
  countActiveAssignments: (businessId: string) => EmployeePolicyAssignment.countDocuments({ businessId, status: "active" }),
  listAudit: (businessId: string, filters: { limit: number; employeeId?: string; policyId?: string; action?: string }) => PolicyAudit.find({ businessId, ...(filters.employeeId ? { employeeId: filters.employeeId } : {}), ...(filters.policyId ? { policyId: filters.policyId } : {}), ...(filters.action ? { action: filters.action } : {}) }).sort({ occurredAt: -1, _id: -1 }).limit(filters.limit).lean(),
};

export type WarpDemoRepository = typeof warpDemoRepository;
