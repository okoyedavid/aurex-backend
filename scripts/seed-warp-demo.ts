import crypto from "node:crypto";
import mongoose, { Types } from "mongoose";
import { env } from "../src/config/env.js";
import { connectToDatabase } from "../src/config/db.js";
import { User } from "../src/modules/users/user.models.js";
import { Business } from "../src/modules/business/business.model.js";
import { EmployeeList } from "../src/modules/employee-list/employee-list.model.js";
import { EmployeeType } from "../src/modules/employee-type/employee-type.model.js";
import { EmployeeGroup } from "../src/modules/employee-group/employee-group.model.js";
import { Employee } from "../src/modules/employee/employee.model.js";
import { PolicyCategory } from "../src/modules/policy-category/policy-category.model.js";
import { Policy } from "../src/modules/policy/policy.model.js";
import { PolicyRule, type PolicyRuleCondition } from "../src/modules/policy-rule/policy-rule.model.js";
import { EmployeePolicyAssignment } from "../src/modules/employee-policy-assignment/employee-policy-assignment.model.js";
import { PolicyAudit } from "../src/modules/policy-audit/policy-audit.model.js";
import { policyReconciliationService } from "../src/modules/policy/policy.module.js";

const oid = (scope: string) => new Types.ObjectId(crypto.createHash("sha256").update(`aurex-warp-demo:${scope}`).digest("hex").slice(0, 24));
const startMonthsAgo = (months: number, asOf: Date) => new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months, 1));

const employeeTypes = ["Full Time", "Part Time", "Contractor", "Intern"] as const;
const departments = ["Engineering", "Finance", "People Operations", "Sales", "Product"] as const;
const groups = ["Executive", "Managers", "Remote", "Security Sensitive", "New Hires"] as const;

const employeeSeeds = [
  { name: "Sarah Chen", jobTitle: "VP Engineering", department: "Engineering", type: "Full Time", state: "California", groups: ["Executive", "Managers", "Remote"], tenure: 72 },
  { name: "Daniel Brooks", jobTitle: "Senior Backend Engineer", department: "Engineering", type: "Full Time", state: "Texas", groups: ["Remote"], tenure: 60 },
  { name: "Maya Patel", jobTitle: "Software Engineer", department: "Engineering", type: "Full Time", state: "California", groups: ["Remote"], tenure: 24 },
  { name: "James Wilson", jobTitle: "Finance Manager", department: "Finance", type: "Full Time", state: "New York", groups: ["Managers", "Security Sensitive"], tenure: 48 },
  { name: "Amara Okafor", jobTitle: "People Operations Specialist", department: "People Operations", type: "Full Time", state: "Texas", groups: ["Remote"], tenure: 18 },
  { name: "Lucas Martin", jobTitle: "Product Manager", department: "Product", type: "Full Time", state: "California", groups: ["Managers", "Remote"], tenure: 36 },
  { name: "Elena Rossi", jobTitle: "Account Executive", department: "Sales", type: "Full Time", state: "Florida", groups: [], tenure: 8 },
  { name: "Noah Williams", jobTitle: "Security Consultant", department: "Engineering", type: "Contractor", state: "Washington", groups: ["Security Sensitive", "Remote"], tenure: 10 },
  { name: "Priya Nair", jobTitle: "Finance Intern", department: "Finance", type: "Intern", state: "California", groups: ["New Hires"], tenure: 2 },
  { name: "Ethan Clark", jobTitle: "Senior Product Designer", department: "Product", type: "Part Time", state: "New York", groups: ["Remote"], tenure: 60 },
] as const;

const categorySeeds = [
  { name: "Vacation Plan", cardinality: "ONE", description: "Competing paid-time-off plans; one plan wins." },
  { name: "Application Access", cardinality: "MANY", description: "Applications an employee may access." },
  { name: "Equipment", cardinality: "MANY", description: "Equipment packages supplied to an employee." },
  { name: "Work Arrangement", cardinality: "ONE", description: "The employee's primary work arrangement." },
  { name: "Professional Development", cardinality: "MANY", description: "Learning and leadership programs." },
] as const;

type RuleSeed = { name: string; priority: number; conditions: PolicyRuleCondition[] };
type PolicySeed = { category: typeof categorySeeds[number]["name"]; name: string; description: string; rules: RuleSeed[] };

const run = async () => {
  await connectToDatabase(env.MONGO_URI);
  const existingBusiness = env.WARP_DEMO_BUSINESS_ID ? await Business.findById(env.WARP_DEMO_BUSINESS_ID) : await Business.findOne({ name: "Northstar Labs", email: "warp-demo@northstar.invalid" });
  if (existingBusiness && (existingBusiness.name !== "Northstar Labs" || existingBusiness.email !== "warp-demo@northstar.invalid")) {
    throw new Error("WARP_DEMO_BUSINESS_ID points to a non-demo business; refusing to modify it");
  }
  const businessId = existingBusiness?._id ?? (env.WARP_DEMO_BUSINESS_ID ? new Types.ObjectId(env.WARP_DEMO_BUSINESS_ID) : oid("business"));
  const owner = await User.findOneAndUpdate(
    { email: "warp-demo-admin@northstar.invalid" },
    { $set: { name: "Northstar Demo Administrator", status: "active", emailVerifiedAt: new Date() }, $setOnInsert: { email: "warp-demo-admin@northstar.invalid" } },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  if (!owner) throw new Error("Failed to create demo owner");

  await Business.findOneAndUpdate(
    { _id: businessId },
    { $set: { name: "Northstar Labs", country: "United States", email: "warp-demo@northstar.invalid", address: "Synthetic demo tenant", ownerUserId: owner._id, industry: "Technology", defaultCurrency: "USD", status: "active", isVerified: true } },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  const scope = { businessId };
  await Promise.all([
    PolicyAudit.deleteMany(scope), EmployeePolicyAssignment.deleteMany(scope), PolicyRule.deleteMany(scope),
    Policy.deleteMany(scope), PolicyCategory.deleteMany(scope), Employee.deleteMany(scope),
    EmployeeList.deleteMany(scope), EmployeeType.deleteMany(scope), EmployeeGroup.deleteMany(scope),
  ]);

  const typeIds = new Map(employeeTypes.map((name) => [name, oid(`type:${name}`)]));
  const departmentIds = new Map(departments.map((name) => [name, oid(`department:${name}`)]));
  const groupIds = new Map(groups.map((name) => [name, oid(`group:${name}`)]));
  const categoryIds = new Map(categorySeeds.map((item) => [item.name, oid(`category:${item.name}`)]));

  await EmployeeType.insertMany(employeeTypes.map((name) => ({ _id: typeIds.get(name), businessId, name, description: `Northstar ${name.toLowerCase()} employee type`, sourceTemplateKey: null, status: "active" })));
  await EmployeeList.insertMany(departments.map((name) => ({ _id: departmentIds.get(name), businessId, name, description: `Northstar ${name} department`, currency: "USD", defaultPayFrequency: "monthly", paymentStatus: "blocked", paymentBlockedReason: "Synthetic demo data", validationStatus: "completed", totalEmployeeCount: employeeSeeds.filter((employee) => employee.department === name).length, createdByUserId: owner._id })));
  await EmployeeGroup.insertMany(groups.map((name) => ({ _id: groupIds.get(name), businessId, name, description: `Northstar ${name} group`, sourceTemplateKey: null, status: "active" })));
  await PolicyCategory.insertMany(categorySeeds.map((item) => ({ _id: categoryIds.get(item.name), businessId, ...item, status: "active", createdBy: owner._id })));

  const asOf = new Date();
  const employees = await Employee.insertMany(employeeSeeds.map((item, index) => ({
    _id: oid(`employee:${item.name}`), businessId, employeeListId: departmentIds.get(item.department), employeeTypeId: typeIds.get(item.type),
    groupIds: item.groups.map((name) => groupIds.get(name)), employmentStartDate: startMonthsAgo(item.tenure, asOf), state: item.state,
    fullName: item.name, jobTitle: item.jobTitle, bankCode: "000", bankName: "Synthetic Demo Bank", accountNumber: `DEMO${String(index + 1).padStart(6, "0")}`,
    accountName: item.name, accountVerificationStatus: "unverified", verificationJobStatus: "completed", verificationMode: "demo", amount: 0,
    payFrequency: "monthly", currency: "USD", paymentStatus: "blocked", paymentBlockedReason: "Synthetic demo employee", status: "active",
  })));

  const condition = (field: PolicyRuleCondition["field"], operator: PolicyRuleCondition["operator"], value: PolicyRuleCondition["value"]): PolicyRuleCondition => ({ field, operator, value });
  const type = (name: typeof employeeTypes[number]) => typeIds.get(name)!;
  const department = (name: typeof departments[number]) => departmentIds.get(name)!;
  const group = (name: typeof groups[number]) => groupIds.get(name)!;
  const rules = (name: string, priority: number, conditions: PolicyRuleCondition[]): RuleSeed[] => [{ name, priority, conditions }];

  const policySeeds: PolicySeed[] = [
    { category: "Vacation Plan", name: "Standard Vacation", description: "Baseline vacation for full-time employees.", rules: rules("Full-time baseline", 10, [condition("employeeType", "equals", type("Full Time"))]) },
    { category: "Vacation Plan", name: "California Vacation", description: "California-specific vacation plan.", rules: rules("California full-time", 20, [condition("state", "equals", "California"), condition("employeeType", "equals", type("Full Time"))]) },
    { category: "Vacation Plan", name: "Senior Vacation", description: "Vacation plan for long-tenure employees.", rules: rules("Five-year full-time", 30, [condition("tenure", "gte", 60), condition("employeeType", "equals", type("Full Time"))]) },
    { category: "Vacation Plan", name: "Manager Vacation", description: "Vacation plan for managers.", rules: rules("Manager full-time", 35, [condition("group", "contains", group("Managers")), condition("employeeType", "equals", type("Full Time"))]) },
    { category: "Vacation Plan", name: "Executive Vacation", description: "Highest-priority executive vacation plan.", rules: rules("Executive", 40, [condition("group", "contains", group("Executive"))]) },
    { category: "Application Access", name: "Slack Access", description: "Company-wide communication access.", rules: rules("All active employees", 10, [condition("tenure", "gte", 0)]) },
    { category: "Application Access", name: "GitHub Access", description: "Source control access for Engineering.", rules: rules("Engineering", 20, [condition("department", "equals", department("Engineering"))]) },
    { category: "Application Access", name: "Jira Access", description: "Planning access for Engineering and Product.", rules: rules("Engineering or Product", 20, [condition("department", "in", [department("Engineering"), department("Product")])]) },
    { category: "Application Access", name: "Finance Systems Access", description: "Finance tooling excluding interns.", rules: rules("Finance non-intern", 30, [condition("department", "equals", department("Finance")), condition("employeeType", "not_equals", type("Intern"))]) },
    { category: "Application Access", name: "HRIS Admin Access", description: "HRIS administration for People Operations.", rules: rules("People Operations", 30, [condition("department", "equals", department("People Operations"))]) },
    { category: "Application Access", name: "Security Console Access", description: "Security tooling for sensitive roles.", rules: rules("Security sensitive", 40, [condition("group", "contains", group("Security Sensitive"))]) },
    { category: "Equipment", name: "Standard Laptop", description: "Standard employee laptop.", rules: rules("Employees", 10, [condition("employeeType", "in", [type("Full Time"), type("Part Time")])]) },
    { category: "Equipment", name: "Engineering Workstation", description: "High-performance Engineering workstation.", rules: rules("Full-time Engineering", 30, [condition("department", "equals", department("Engineering")), condition("employeeType", "equals", type("Full Time"))]) },
    { category: "Equipment", name: "Executive Mobile Package", description: "Executive mobile equipment bundle.", rules: rules("Executive", 40, [condition("group", "contains", group("Executive"))]) },
    { category: "Work Arrangement", name: "Office First", description: "Default office-first arrangement.", rules: rules("All active employees", 10, [condition("tenure", "gte", 0)]) },
    { category: "Work Arrangement", name: "Hybrid Work", description: "Hybrid arrangement for managers.", rules: rules("Managers", 20, [condition("group", "contains", group("Managers"))]) },
    { category: "Work Arrangement", name: "Remote Work", description: "Remote arrangement for approved employees.", rules: rules("Remote group", 30, [condition("group", "contains", group("Remote"))]) },
    { category: "Professional Development", name: "Learning Stipend", description: "Learning support for full-time and part-time employees.", rules: [
      { name: "Full-time learning stipend", priority: 10, conditions: [condition("employeeType", "equals", type("Full Time"))] },
      { name: "Part-time learning stipend", priority: 10, conditions: [condition("employeeType", "equals", type("Part Time"))] },
    ] },
    { category: "Professional Development", name: "Leadership Program", description: "Leadership training for managers.", rules: rules("Managers", 30, [condition("group", "contains", group("Managers"))]) },
    { category: "Professional Development", name: "Executive Coaching", description: "One-to-one coaching for executives.", rules: rules("Executives", 40, [condition("group", "contains", group("Executive"))]) },
  ];

  const policyDocs = await Policy.insertMany(policySeeds.map((item) => ({ _id: oid(`policy:${item.name}`), businessId, categoryId: categoryIds.get(item.category), name: item.name, description: item.description, configuration: { demo: true }, version: 1, status: "active", effectiveFrom: null, effectiveTo: null, createdBy: owner._id, updatedBy: owner._id })));
  await PolicyRule.insertMany(policySeeds.flatMap((item) => item.rules.map((rule, index) => ({ _id: oid(`rule:${item.name}:${index}`), businessId, policyId: oid(`policy:${item.name}`), name: rule.name, conditions: rule.conditions, priority: rule.priority, version: 1, status: "active", effectiveFrom: null, effectiveTo: null, createdBy: owner._id, updatedBy: owner._id }))));

  await PolicyAudit.insertMany(policyDocs.slice(0, 20).map((policy, index) => ({ businessId, entityType: "policy", entityId: policy._id, policyId: policy._id, categoryId: policy.categoryId, action: "POLICY_ACTIVATED", actorType: "user", actorUserId: owner._id, reason: "warp_demo_seed", occurredAt: new Date(asOf.getTime() - (20 - index) * 6 * 60 * 60_000) })));

  for (const employee of employees) {
    await policyReconciliationService.reconcileEmployeePolicies({ businessId: id(businessId), employeeId: employee.id, asOfDate: asOf, reason: "warp_demo_seed", actor: { actorType: "worker" }, triggeredByUserId: owner.id });
  }

  const activeAssignments = await EmployeePolicyAssignment.find({ ...scope, status: "active" }).lean();
  const policyNameById = new Map(policyDocs.map((policy) => [policy.id, policy.name]));
  const employeeIdByName = new Map(employees.map((employee) => [employee.fullName, employee.id]));
  const assignedNames = (employeeName: string, categoryName?: string) => {
    const expectedCategoryId = categoryName ? id(categoryIds.get(categoryName)) : null;
    return activeAssignments
      .filter((assignment) => id(assignment.employeeId) === employeeIdByName.get(employeeName) && (!expectedCategoryId || id(assignment.categoryId) === expectedCategoryId))
      .map((assignment) => policyNameById.get(id(assignment.policyId))!)
      .sort();
  };
  const assertPolicies = (employeeName: string, categoryName: string, expected: string[]) => {
    const actual = assignedNames(employeeName, categoryName);
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${employeeName} ${categoryName} assertion failed: expected ${expected.join(", ")}; received ${actual.join(", ")}`);
  };
  assertPolicies("Sarah Chen", "Vacation Plan", ["Executive Vacation"]);
  assertPolicies("Maya Patel", "Vacation Plan", ["California Vacation"]);
  assertPolicies("Daniel Brooks", "Vacation Plan", ["Senior Vacation"]);
  if (assignedNames("Priya Nair").includes("Finance Systems Access")) throw new Error("Priya Nair must not receive Finance Systems Access");
  if (assignedNames("Daniel Brooks", "Application Access").length < 2) throw new Error("Application Access must retain multiple matching policies");
  assertPolicies("Sarah Chen", "Equipment", ["Standard Laptop", "Engineering Workstation", "Executive Mobile Package"]);

  const [employeeCount, categoryCount, policyCount, ruleCount, assignmentCount, auditCount] = await Promise.all([
    Employee.countDocuments(scope), PolicyCategory.countDocuments(scope), Policy.countDocuments(scope), PolicyRule.countDocuments(scope), EmployeePolicyAssignment.countDocuments({ ...scope, status: "active" }), PolicyAudit.countDocuments(scope),
  ]);
  if (employeeCount !== 10 || categoryCount !== 5 || policyCount !== 20 || ruleCount !== 21) throw new Error(`Unexpected seed counts: employees=${employeeCount}, categories=${categoryCount}, policies=${policyCount}, rules=${ruleCount}`);
  console.log("Warp demo seed complete", { businessId: id(businessId), employeeCount, categoryCount, policyCount, ruleCount, assignmentCount, auditCount, assertions: "Sarah/Maya/Daniel/Priya/multi-access/MANY equipment passed" });
  if (!env.WARP_DEMO_BUSINESS_ID) console.log(`Set WARP_DEMO_BUSINESS_ID=${id(businessId)} in the runtime environment.`);
};

const id = (value: unknown) => String(value);
run().catch((error) => { console.error("Warp demo seed failed", error); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
