import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { Business } from "../business/business.model.js";
import { BusinessMember } from "../business-member/business-member.model.js";
import { EmployeeList } from "../employee-list/employee-list.model.js";
import { Employee } from "../employee/employee.model.js";
import { EmployeePolicyAssignment } from "../employee-policy-assignment/employee-policy-assignment.model.js";
import { PolicyAudit } from "../policy-audit/policy-audit.model.js";
import { PolicyCategory } from "../policy-category/policy-category.model.js";
import { PolicyRule } from "../policy-rule/policy-rule.model.js";
import { Role, systemRolePermissions } from "../role/role.model.js";
import { User } from "../users/user.models.js";
import { policyReconciliationService } from "./policy.module.js";
import { Policy } from "./policy.model.js";

describe("policy assignment routes", () => {
  const agent = request.agent(app);
  const email = `policy-${Date.now()}-${crypto.randomUUID()}@test.local`;
  const password = "Password123!";
  let userId: string;
  let businessId: string;
  let employeeListId: string;
  let employeeId: string;

  beforeAll(async () => {
    expect((await agent.post("/api/auth/register").send({ name: "Policy Owner", email, password })).status).toBe(201);
    const user = await User.findOne({ email });
    userId = user!.id;
    expect((await agent.post("/api/auth/login").send({ email, password })).status).toBe(200);
    const businessResponse = await agent.post("/api/businesses").send({ name: `Policy Business ${Date.now()}`, industry: "technology" });
    expect(businessResponse.status).toBe(201);
    businessId = businessResponse.body.data.id;
    const membership = await BusinessMember.findOne({ businessId, userId });
    await Role.updateOne({ _id: membership!.roleId }, { $set: { permissions: systemRolePermissions.owner } });

    const listResponse = await agent.post(`/api/businesses/${businessId}/employee-lists`).send({ name: "Engineering", currency: "NGN", payFrequency: "monthly" });
    employeeListId = listResponse.body.data.id;
    const employeeResponse = await agent.post(`/api/businesses/${businessId}/employee-lists/${employeeListId}/employees`).send({ fullName: "Policy Employee", jobTitle: "Engineer", bankCode: "058", bankName: "GTBank", accountNumber: "5801017199", amount: 1000, currency: "NGN", payFrequency: "monthly", state: "CA", employmentStartDate: "2020-01-01" });
    employeeId = employeeResponse.body.data.id;
  });

  afterAll(async () => {
    await Promise.all([
      PolicyAudit.deleteMany({ businessId }),
      EmployeePolicyAssignment.deleteMany({ businessId }),
      PolicyRule.deleteMany({ businessId }),
      Policy.deleteMany({ businessId }),
      PolicyCategory.deleteMany({ businessId }),
      Employee.deleteMany({ businessId }),
      EmployeeList.deleteMany({ businessId }),
      BusinessMember.deleteMany({ businessId }),
      Business.deleteOne({ _id: businessId }),
      User.deleteOne({ _id: userId }),
    ]);
  });

  it("creates, resolves, reconciles and audits a policy", async () => {
    const categoryResponse = await agent.post(`/api/businesses/${businessId}/policy-categories`).send({ name: "Vacation Plan", cardinality: "ONE" });
    expect(categoryResponse.status).toBe(201);
    const categoryId = categoryResponse.body.data.id as string;

    const policyResponse = await agent.post(`/api/businesses/${businessId}/policies`).send({ categoryId, name: "California Vacation" });
    expect(policyResponse.status).toBe(201);
    const policyId = policyResponse.body.data.id as string;
    expect((await agent.post(`/api/businesses/${businessId}/policies/${policyId}/activate`).send({})).status).toBe(200);

    const ruleResponse = await agent.post(`/api/businesses/${businessId}/policies/${policyId}/rules`).send({ name: "California engineers", priority: 20, conditions: [{ field: "department", operator: "equals", value: employeeListId }, { field: "state", operator: "equals", value: "CA" }, { field: "tenure", operator: "gte", value: 12 }] });
    expect(ruleResponse.status).toBe(201);
    const ruleId = ruleResponse.body.data.id as string;

    const explanation = await agent.get(`/api/businesses/${businessId}/employees/${employeeId}/policies/explain`);
    expect(explanation.status).toBe(200);
    expect(explanation.body.data.desiredPolicies).toHaveLength(1);
    expect(explanation.body.data.desiredPolicies[0]).toMatchObject({ policyId, priority: 20, source: "rule" });

    const first = await policyReconciliationService.reconcileEmployeePolicies({ businessId, employeeId, asOfDate: new Date(), reason: "integration_test", actor: { actorType: "worker" }, triggeredByUserId: userId });
    expect(first.changes.some((change) => change.operation === "CREATE")).toBe(true);
    const second = await policyReconciliationService.reconcileEmployeePolicies({ businessId, employeeId, asOfDate: new Date(), reason: "integration_test", actor: { actorType: "worker" }, triggeredByUserId: userId });
    expect(second.changes.every((change) => change.operation === "KEEP")).toBe(true);

    const policies = await agent.get(`/api/businesses/${businessId}/employees/${employeeId}/policies`);
    expect(policies.body.data.items).toHaveLength(1);
    expect(policies.body.data.items[0]).toMatchObject({
      winningRuleId: ruleId,
      matchedRuleIds: [ruleId],
      winningRule: { id: ruleId, name: "California engineers" },
      matchedRules: [{ id: ruleId, name: "California engineers" }],
    });
    const history = await agent.get(`/api/businesses/${businessId}/employees/${employeeId}/policy-history?page=1&limit=20`);
    expect(history.status).toBe(200);
    expect(history.body.data.items.some((item: { action: string }) => item.action === "ASSIGNMENT_CREATED")).toBe(true);
  });

  it("rejects a department reference owned by another business", async () => {
    const otherBusiness = await Business.create({ name: "Other Business", industry: "technology", ownerUserId: userId, defaultCurrency: "NGN" });
    const otherList = await EmployeeList.create({ businessId: otherBusiness.id, name: "Foreign Department", currency: "NGN", defaultPayFrequency: "monthly", createdByUserId: userId });
    const category = await PolicyCategory.findOne({ businessId });
    const policy = await Policy.create({ businessId, categoryId: category!.id, name: "Isolation Policy", version: 1, status: "draft", createdBy: userId, updatedBy: userId });
    const response = await agent.post(`/api/businesses/${businessId}/policies/${policy.id}/rules`).send({ priority: 1, conditions: [{ field: "department", operator: "equals", value: otherList.id }] });
    expect(response.status).toBe(400);
    await Promise.all([EmployeeList.deleteOne({ _id: otherList.id }), Business.deleteOne({ _id: otherBusiness.id })]);
  });
});
