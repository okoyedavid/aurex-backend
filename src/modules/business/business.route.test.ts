import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { BusinessMember } from "../business-member/business-member.model.js";
import { EmployeeList } from "../employee-list/employee-list.model.js";
import { Employee } from "../employee/employee.model.js";
import { EmployeeType } from "../employee-type/employee-type.model.js";
import { EmployeeGroup } from "../employee-group/employee-group.model.js";
import { Role } from "../role/role.model.js";
import { User } from "../users/user.models.js";
import { Business } from "./business.model.js";

const employeePayload = (fullName: string, accountNumber: string) => ({
  fullName,
  jobTitle: "Software Engineer",
  bankCode: "058",
  bankName: "Guaranty Trust Bank",
  accountNumber,
  amount: 250_000,
  currency: "NGN",
  payFrequency: "monthly",
});

describe("business employee creation routes", () => {
  const email = `business-${Date.now()}-${crypto.randomUUID()}@test.local`;
  const password = "Password123!";
  const agent = request.agent(app);
  let ownerUserId: string;
  let baseBusinessId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const registerRes = await agent.post("/api/auth/register").send({
      name: "Business Owner",
      email,
      password,
    });
    expect(registerRes.status).toBe(201);

    const user = await User.findOne({ email });
    expect(user).not.toBeNull();
    ownerUserId = String(user!._id);

    const loginRes = await agent.post("/api/auth/login").send({
      email,
      password,
    });
    expect(loginRes.status).toBe(200);

    const businessRes = await agent.post("/api/businesses").send({
      name: `Base Business ${Date.now()}`,
      industry: "technology",
    });
    expect(businessRes.status).toBe(201);
    baseBusinessId = businessRes.body.data.id;
  });

  afterAll(async () => {
    const businesses = await Business.find({ ownerUserId }).select("_id");
    const businessIds = businesses.map((business) => business._id);

    await Promise.all([
      Employee.deleteMany({ businessId: { $in: businessIds } }),
      EmployeeType.deleteMany({ businessId: { $in: businessIds } }),
      EmployeeGroup.deleteMany({ businessId: { $in: businessIds } }),
      EmployeeList.deleteMany({ businessId: { $in: businessIds } }),
      BusinessMember.deleteMany({ businessId: { $in: businessIds } }),
      Role.deleteMany({ businessId: { $in: businessIds } }),
      Business.deleteMany({ _id: { $in: businessIds } }),
      User.deleteOne({ _id: ownerUserId }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
    ]);
  });

  it("creates a business with multiple employee lists and employees", async () => {
    const response = await agent.post("/api/businesses").send({
      name: `Nested Business ${Date.now()}`,
      industry: "financial services",
      employeeLists: [
        {
          name: "Engineering Payroll",
          description: "Monthly engineering payroll",
          currency: "NGN",
          payFrequency: "monthly",
          employees: [
            employeePayload("Ada Okafor", "5801017089"),
            employeePayload("Tunde Bello", "5801017090"),
          ],
        },
        {
          name: "Contractors",
          currency: "NGN",
          payFrequency: "one_time",
          employees: [],
        },
      ],
    });

    expect(response.status).toBe(201);
    const businessId = response.body.data.id as string;
    const lists = await EmployeeList.find({ businessId }).sort({ name: 1 });
    const employees = await Employee.find({ businessId }).sort({ fullName: 1 });

    expect(lists).toHaveLength(2);
    expect(employees).toHaveLength(2);

    const engineeringList = lists.find(
      (list) => list.name === "Engineering Payroll",
    );
    expect(engineeringList?.totalEmployeeCount).toBe(2);
    expect(engineeringList?.pendingVerificationCount).toBe(2);
    expect(engineeringList?.validationStatus).toBe("pending");
    expect(employees.every((employee) => employee.verificationJobStatus === "pending"))
      .toBe(true);
    expect(employees.every((employee) => employee.accountVerificationStatus === "unverified"))
      .toBe(true);
  });

  it("creates an employee list through the dedicated route", async () => {
    const response = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-lists`)
      .send({
        name: `Operations Payroll ${Date.now()}`,
        currency: "NGN",
        payFrequency: "monthly",
        employees: [employeePayload("Ngozi Eze", "5801017091")],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.businessId).toBe(baseBusinessId);
    expect(response.body.data.totalEmployeeCount).toBe(1);

    const employeeCount = await Employee.countDocuments({
      employeeListId: response.body.data.id,
    });
    expect(employeeCount).toBe(1);

    const listResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-lists?page=1&limit=1`,
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.items).toHaveLength(1);
    expect(listResponse.body.data.pagination).toMatchObject({
      page: 1,
      limit: 1,
    });
    expect(listResponse.body.data.pagination.total).toBeGreaterThanOrEqual(1);

    const employeeListId = response.body.data.id as string;
    const detailResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}`,
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(employeeListId);
    expect(detailResponse.body.data._id).toBeUndefined();

    const updateResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}`,
      )
      .send({ description: "Updated operations payroll" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.description).toBe(
      "Updated operations payroll",
    );
  });

  it("creates one employee through the dedicated employee route", async () => {
    const listResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-lists`)
      .send({
        name: `Finance Payroll ${Date.now()}`,
        currency: "NGN",
        payFrequency: "monthly",
      });
    expect(listResponse.status).toBe(201);

    const employeeListId = listResponse.body.data.id as string;
    const employeeResponse = await agent
      .post(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees`,
      )
      .send(employeePayload("Chidi Obi", "5801017092"));

    expect(employeeResponse.status).toBe(201);
    expect(employeeResponse.body.data.employeeListId).toBe(employeeListId);
    expect(employeeResponse.body.data.verificationJobStatus).toBe("pending");
    const employeeId = employeeResponse.body.data.id as string;

    const employeesResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees?page=1&limit=10`,
    );
    expect(employeesResponse.status).toBe(200);
    expect(employeesResponse.body.data.items).toHaveLength(1);
    expect(employeesResponse.body.data.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    const employeeDetailResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
    );
    expect(employeeDetailResponse.status).toBe(200);
    expect(employeeDetailResponse.body.data.id).toBe(employeeId);
    expect(employeeDetailResponse.body.data._id).toBeUndefined();

    const updateEmployeeResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
      )
      .send({ fullName: "Chidi Obi Updated" });
    expect(updateEmployeeResponse.status).toBe(200);
    expect(updateEmployeeResponse.body.data.fullName).toBe("Chidi Obi Updated");

    const bankUpdateResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
      )
      .send({ accountNumber: "5801017093" });
    expect(bankUpdateResponse.status).toBe(200);
    expect(bankUpdateResponse.body.data.accountVerificationStatus).toBe("stale");
    expect(bankUpdateResponse.body.data.verificationJobStatus).toBe("pending");
    expect(bankUpdateResponse.body.data.paymentStatus).toBe("blocked");

    const statusResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/verification-status`,
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.totalEmployeeCount).toBe(1);
    expect(statusResponse.body.data.pendingVerificationCount).toBe(1);
  });

  it("resolves business-owned employee defaults and assigns them to employees", async () => {
    const systemTypesResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-types/system`,
    );
    expect(systemTypesResponse.status).toBe(200);
    expect(systemTypesResponse.body.data.items).toContainEqual({
      key: "full_time",
      name: "Full Time",
    });

    const systemGroupsResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-groups/system`,
    );
    expect(systemGroupsResponse.status).toBe(200);
    expect(systemGroupsResponse.body.data.items).toContainEqual({
      key: "engineering",
      name: "Engineering",
    });

    const typeResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-types`)
      .send({ templateKey: "full_time" });
    expect(typeResponse.status).toBe(201);
    expect(typeResponse.body.meta.created).toBe(true);
    expect(typeResponse.body.data).toMatchObject({
      businessId: baseBusinessId,
      name: "Full Time",
      sourceTemplateKey: "full_time",
      status: "active",
    });
    const employeeTypeId = typeResponse.body.data.id as string;

    const repeatedTypeResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-types`)
      .send({ templateKey: "full_time" });
    expect(repeatedTypeResponse.status).toBe(200);
    expect(repeatedTypeResponse.body.meta.created).toBe(false);
    expect(repeatedTypeResponse.body.data.id).toBe(employeeTypeId);

    const groupResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-groups`)
      .send({ templateKey: "engineering" });
    expect(groupResponse.status).toBe(201);
    const employeeGroupId = groupResponse.body.data.id as string;

    const customGroupResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-groups`)
      .send({
        name: "Platform Team",
        description: "Platform engineering employees",
      });
    expect(customGroupResponse.status).toBe(201);

    const updateTypeResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-types/${employeeTypeId}`,
      )
      .send({ description: "Permanent salaried employees" });
    expect(updateTypeResponse.status).toBe(200);
    expect(updateTypeResponse.body.data.description).toBe(
      "Permanent salaried employees",
    );

    const updateGroupResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-groups/${employeeGroupId}`,
      )
      .send({ description: "Core engineering group" });
    expect(updateGroupResponse.status).toBe(200);

    const listTypesResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-types?page=1&limit=20`,
    );
    expect(listTypesResponse.status).toBe(200);
    expect(listTypesResponse.body.data.items).toHaveLength(1);

    const listGroupsResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/employee-groups?page=1&limit=20`,
    );
    expect(listGroupsResponse.status).toBe(200);
    expect(listGroupsResponse.body.data.items).toHaveLength(2);

    const listResponse = await agent
      .post(`/api/businesses/${baseBusinessId}/employee-lists`)
      .send({
        name: `Policy Payroll ${Date.now()}`,
        currency: "NGN",
        payFrequency: "monthly",
      });
    expect(listResponse.status).toBe(201);
    const employeeListId = listResponse.body.data.id as string;

    const rejectedCreateResponse = await agent
      .post(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees`,
      )
      .send({
        ...employeePayload("Policy Employee", "5801017094"),
        employeeTypeId,
        groupIds: [employeeGroupId],
        employmentStartDate: "2026-08-31",
        state: "Lagos",
      });
    expect(rejectedCreateResponse.status).toBe(400);

    const createEmployeeResponse = await agent
      .post(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees`,
      )
      .send({
        ...employeePayload("Policy Employee", "5801017094"),
        employeeTypeId,
        employmentStartDate: "2026-08-31",
        state: "Lagos",
      });
    expect(createEmployeeResponse.status).toBe(201);
    expect(createEmployeeResponse.body.data).toMatchObject({
      employeeTypeId,
      state: "Lagos",
      groupIds: [],
    });
    const employeeId = createEmployeeResponse.body.data.id as string;

    const assignGroupResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
      )
      .send({ groupIds: [employeeGroupId, employeeGroupId] });
    expect(assignGroupResponse.status).toBe(200);
    expect(assignGroupResponse.body.data.groupIds).toEqual([employeeGroupId]);

    const directReportResponse = await agent
      .post(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees`,
      )
      .send({
        ...employeePayload("Policy Direct Report", "5801017095"),
        managerEmployeeId: employeeId,
      });
    expect(directReportResponse.status).toBe(201);
    expect(directReportResponse.body.data.managerEmployeeId).toBe(employeeId);
    const directReportId = directReportResponse.body.data.id as string;

    const selfManagerResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
      )
      .send({ managerEmployeeId: employeeId });
    expect(selfManagerResponse.status).toBe(400);

    const cyclicManagerResponse = await agent
      .patch(
        `/api/businesses/${baseBusinessId}/employee-lists/${employeeListId}/employees/${employeeId}`,
      )
      .send({ managerEmployeeId: directReportId });
    expect(cyclicManagerResponse.status).toBe(400);
  });

  it("lists and retrieves business members with populated details", async () => {
    const invitedUser = await User.create({
      name: "Invited Member",
      email: `member-${Date.now()}-${crypto.randomUUID()}@test.local`,
      password,
    });
    createdUserIds.push(String(invitedUser._id));

    const memberRole = await Role.create({
      businessId: baseBusinessId,
      name: "Manager",
      key: `manager-${Date.now()}`,
      type: "custom",
      permissions: ["members:view"],
      deniedPermissions: [],
    });

    const member = await BusinessMember.create({
      businessId: baseBusinessId,
      userId: invitedUser._id,
      roleId: memberRole._id,
      invitedByUserId: ownerUserId,
    });

    const listResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/members?page=1&limit=20`,
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.items.some((item: { id: string }) => item.id === String(member._id))).toBe(true);

    const listedMember = listResponse.body.data.items.find(
      (item: { id: string }) => item.id === String(member._id),
    );
    expect(listedMember._id).toBeUndefined();
    expect(listedMember.userId.email).toBe(invitedUser.email);
    expect(listedMember.roleId.key).toBe(memberRole.key);
    expect(listedMember.invitedByUserId.id).toBe(ownerUserId);

    const detailResponse = await agent.get(
      `/api/businesses/${baseBusinessId}/members/${String(member._id)}`,
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(String(member._id));
    expect(detailResponse.body.data._id).toBeUndefined();
    expect(detailResponse.body.data.invitedByUserId.id).toBe(ownerUserId);
  });
});
