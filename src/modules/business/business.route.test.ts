import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { BusinessMember } from "../business-member/business-member.model.js";
import { EmployeeList } from "../employee-list/employee-list.model.js";
import { Employee } from "../employee/employee.model.js";
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
