import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { BusinessMember } from "../business-member/business-member.model.js";
import { Business } from "../business/business.model.js";
import { Role, systemRolePermissions } from "../role/role.model.js";
import { User } from "../users/user.models.js";
import { BusinessInvite } from "./business-invite.model.js";
import { Notification } from "../notification/notification.model.js";
import { AuditEvent } from "../audit-event/audit-event.model.js";
import { Employee } from "../employee/employee.model.js";
import { EmployeeList } from "../employee-list/employee-list.model.js";

describe("business invitation routes", () => {
  const password = "Password123!";
  const ownerEmail = `invite-owner-${crypto.randomUUID()}@test.local`;
  const recipientEmail = `invite-recipient-${crypto.randomUUID()}@test.local`;
  const rejectedEmail = `invite-rejected-${crypto.randomUUID()}@test.local`;
  const delegatedEmail = `invite-delegated-${crypto.randomUUID()}@test.local`;
  const approvalEmail = `invite-approval-${crypto.randomUUID()}@test.local`;
  const directEmployeeEmail = `invite-direct-employee-${crypto.randomUUID()}@test.local`;
  const ownerCreatedEmployeeEmail = `invite-owner-created-employee-${crypto.randomUUID()}@test.local`;
  const delegatedEmployeeEmail = `invite-delegated-employee-${crypto.randomUUID()}@test.local`;
  const delegatedCreatedEmployeeEmail = `invite-delegated-created-employee-${crypto.randomUUID()}@test.local`;
  const existingMemberEmployeeEmail = `invite-existing-member-employee-${crypto.randomUUID()}@test.local`;
  const ownerAgent = request.agent(app);
  const recipientAgent = request.agent(app);
  const rejectedAgent = request.agent(app);
  const delegatedAgent = request.agent(app);
  const approvalAgent = request.agent(app);
  const directEmployeeAgent = request.agent(app);
  const ownerCreatedEmployeeAgent = request.agent(app);
  const delegatedEmployeeAgent = request.agent(app);
  const delegatedCreatedEmployeeAgent = request.agent(app);
  const existingMemberEmployeeAgent = request.agent(app);
  let businessId: string;
  let recipientUserId: string;
  let ownerUserId: string;
  let rejectedUserId: string;
  let delegatedUserId: string;
  let approvalUserId: string;
  let directEmployeeUserId: string;
  let ownerCreatedEmployeeUserId: string;
  let delegatedEmployeeUserId: string;
  let delegatedCreatedEmployeeUserId: string;
  let existingMemberEmployeeUserId: string;
  let viewerRoleId: string;
  let employeeListId: string;

  const registerAndLogin = async (
    agent: ReturnType<typeof request.agent>,
    name: string,
    email: string,
  ) => {
    expect(
      (await agent.post("/api/auth/register").send({ name, email, password }))
        .status,
    ).toBe(201);
    expect(
      (await agent.post("/api/auth/login").send({ email, password })).status,
    ).toBe(200);
  };

  beforeAll(async () => {
    for (const role of [
      { key: "owner", name: "Owner" },
      { key: "viewer", name: "Viewer" },
    ] as const) {
      await Role.updateOne(
        { key: role.key, type: "system", businessId: null },
        {
          $set: {
            ...role,
            type: "system",
            businessId: null,
            permissions: systemRolePermissions[role.key],
            deniedPermissions: [],
          },
        },
        { upsert: true },
      );
    }

    const viewerRole = await Role.findOne({
      key: "viewer",
      type: "system",
      businessId: null,
    });
    expect(viewerRole).not.toBeNull();
    viewerRoleId = viewerRole!._id.toString();

    await registerAndLogin(ownerAgent, "Invite Owner", ownerEmail);
    await registerAndLogin(
      recipientAgent,
      "Invite Recipient",
      recipientEmail,
    );
    await registerAndLogin(rejectedAgent, "Rejected Recipient", rejectedEmail);
    await registerAndLogin(delegatedAgent, "Delegated Inviter", delegatedEmail);
    await registerAndLogin(approvalAgent, "Approval Recipient", approvalEmail);
    await registerAndLogin(
      directEmployeeAgent,
      "Direct Employee Recipient",
      directEmployeeEmail,
    );
    await registerAndLogin(
      ownerCreatedEmployeeAgent,
      "Owner Created Employee Recipient",
      ownerCreatedEmployeeEmail,
    );
    await registerAndLogin(
      delegatedEmployeeAgent,
      "Delegated Employee Recipient",
      delegatedEmployeeEmail,
    );
    await registerAndLogin(
      delegatedCreatedEmployeeAgent,
      "Delegated Created Employee Recipient",
      delegatedCreatedEmployeeEmail,
    );
    await registerAndLogin(
      existingMemberEmployeeAgent,
      "Existing Member Employee Recipient",
      existingMemberEmployeeEmail,
    );

    const [
      owner,
      recipient,
      rejected,
      delegated,
      approvalRecipient,
      directEmployeeRecipient,
      ownerCreatedEmployeeRecipient,
      delegatedEmployeeRecipient,
      delegatedCreatedEmployeeRecipient,
      existingMemberEmployeeRecipient,
    ] =
      await Promise.all([
        User.findOne({ email: ownerEmail }),
        User.findOne({ email: recipientEmail }),
        User.findOne({ email: rejectedEmail }),
        User.findOne({ email: delegatedEmail }),
        User.findOne({ email: approvalEmail }),
        User.findOne({ email: directEmployeeEmail }),
        User.findOne({ email: ownerCreatedEmployeeEmail }),
        User.findOne({ email: delegatedEmployeeEmail }),
        User.findOne({ email: delegatedCreatedEmployeeEmail }),
        User.findOne({ email: existingMemberEmployeeEmail }),
      ]);
    expect(owner).not.toBeNull();
    expect(recipient).not.toBeNull();
    expect(rejected).not.toBeNull();
    expect(delegated).not.toBeNull();
    expect(approvalRecipient).not.toBeNull();
    expect(directEmployeeRecipient).not.toBeNull();
    expect(ownerCreatedEmployeeRecipient).not.toBeNull();
    expect(delegatedEmployeeRecipient).not.toBeNull();
    expect(delegatedCreatedEmployeeRecipient).not.toBeNull();
    expect(existingMemberEmployeeRecipient).not.toBeNull();
    ownerUserId = owner!._id.toString();
    recipientUserId = recipient!._id.toString();
    rejectedUserId = rejected!._id.toString();
    delegatedUserId = delegated!._id.toString();
    approvalUserId = approvalRecipient!._id.toString();
    directEmployeeUserId = directEmployeeRecipient!._id.toString();
    ownerCreatedEmployeeUserId = ownerCreatedEmployeeRecipient!._id.toString();
    delegatedEmployeeUserId = delegatedEmployeeRecipient!._id.toString();
    delegatedCreatedEmployeeUserId =
      delegatedCreatedEmployeeRecipient!._id.toString();
    existingMemberEmployeeUserId =
      existingMemberEmployeeRecipient!._id.toString();

    const response = await ownerAgent.post("/api/businesses").send({
      name: `Invite Business ${Date.now()}`,
      industry: "technology",
    });
    expect(response.status).toBe(201);
    businessId = response.body.data.id;

    const employeeList = await EmployeeList.create({
      businessId,
      name: `Invite Employees ${Date.now()}`,
      currency: "NGN",
      defaultPayFrequency: "monthly",
      createdByUserId: ownerUserId,
    });
    employeeListId = employeeList._id.toString();

    const delegatedRole = await Role.create({
      businessId,
      name: "Delegated Inviter",
      key: `delegated_inviter_${Date.now()}`,
      type: "custom",
      permissions: [
        "members:invite",
        "members:view",
        "roles:view",
        "roles:create",
        "roles:update",
        "roles:delete",
      ],
      deniedPermissions: [],
    });
    await BusinessMember.create({
      businessId,
      userId: delegatedUserId,
      roleId: delegatedRole._id,
      invitedByUserId: ownerUserId,
    });
  });

  afterAll(async () => {
    await Promise.all([
      BusinessInvite.deleteMany({ businessId }),
      Employee.deleteMany({ businessId }),
      EmployeeList.deleteMany({ businessId }),
      BusinessMember.deleteMany({ businessId }),
      Role.deleteMany({ businessId }),
      Business.deleteOne({ _id: businessId }),
      Notification.deleteMany({
        userId: {
          $in: [
            ownerUserId,
            recipientUserId,
            rejectedUserId,
            delegatedUserId,
            approvalUserId,
            directEmployeeUserId,
            ownerCreatedEmployeeUserId,
            delegatedEmployeeUserId,
            delegatedCreatedEmployeeUserId,
            existingMemberEmployeeUserId,
          ],
        },
      }),
      AuditEvent.deleteMany({
        userId: {
          $in: [
            ownerUserId,
            recipientUserId,
            rejectedUserId,
            delegatedUserId,
            approvalUserId,
            directEmployeeUserId,
            ownerCreatedEmployeeUserId,
            delegatedEmployeeUserId,
            delegatedCreatedEmployeeUserId,
            existingMemberEmployeeUserId,
          ],
        },
      }),
      User.deleteMany({
        email: {
          $in: [
            ownerEmail,
            recipientEmail,
            rejectedEmail,
            delegatedEmail,
            approvalEmail,
            directEmployeeEmail,
            ownerCreatedEmployeeEmail,
            delegatedEmployeeEmail,
            delegatedCreatedEmployeeEmail,
            existingMemberEmployeeEmail,
          ],
        },
      }),
    ]);
  });

  it("creates, lists, and accepts an invitation", async () => {
    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({ email: recipientEmail.toUpperCase(), roleId: viewerRoleId });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      email: recipientEmail,
      status: "pending",
      emailDeliveryStatus: "pending",
      emailDeliveryAttempts: 0,
    });
    expect(createResponse.body.data.tokenHash).toBeUndefined();
    const inviteId = createResponse.body.data.id as string;

    const storedInvite = await BusinessInvite.findById(inviteId).select(
      "+tokenHash",
    );
    expect(storedInvite?.tokenHash).toMatch(/^[a-f\d]{64}$/);

    const sentResponse = await ownerAgent.get(
      `/api/businesses/${businessId}/invites?page=1&limit=20`,
    );
    expect(sentResponse.status).toBe(200);
    expect(sentResponse.body.data.items[0].id).toBe(inviteId);

    const receivedResponse = await recipientAgent.get(
      "/api/me/business-invites?page=1&limit=20&status=pending",
    );
    expect(receivedResponse.status).toBe(200);
    expect(receivedResponse.body.data.items[0].id).toBe(inviteId);

    const notificationResponse = await recipientAgent.get(
      "/api/me/notifications?page=1&limit=20&unreadOnly=false",
    );
    expect(notificationResponse.status).toBe(200);
    expect(notificationResponse.body.data.pagination).toMatchObject({
      page: 1,
      limit: 20,
    });
    expect(notificationResponse.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const inviteNotification = notificationResponse.body.data.items.find(
      (item: { type: string }) => item.type === "business.invite.created",
    );
    expect(inviteNotification.id).toBeTypeOf("string");
    expect(inviteNotification._id).toBeUndefined();

    const forbiddenRead = await ownerAgent.patch(
      `/api/me/notifications/${inviteNotification.id}/read`,
    );
    expect(forbiddenRead.status).toBe(404);

    const readResponse = await recipientAgent.patch(
      `/api/me/notifications/${inviteNotification.id}/read`,
    );
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.data.readAt).not.toBeNull();
    const repeatedReadResponse = await recipientAgent.patch(
      `/api/me/notifications/${inviteNotification.id}/read`,
    );
    expect(repeatedReadResponse.status).toBe(200);
    expect(repeatedReadResponse.body.data.readAt).toBe(
      readResponse.body.data.readAt,
    );

    expect(
      (
        await recipientAgent.get(
          "/api/me/notifications?unreadOnly=not-a-boolean",
        )
      ).status,
    ).toBe(400);

    const acceptResponse = await recipientAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.status).toBe("accepted");
    expect(acceptResponse.body.data.approvalStatus).toBe("not_required");
    expect(acceptResponse.body.meta.membershipCreated).toBe(true);

    const membership = await BusinessMember.findOne({
      businessId,
      userId: recipientUserId,
    });
    expect(membership).toMatchObject({ status: "active" });
    expect(membership?.roleId.toString()).toBe(viewerRoleId);

    const afterAcceptance = await recipientAgent.get(
      "/api/me/notifications?unreadOnly=true",
    );
    expect(afterAcceptance.status).toBe(200);
    expect(
      afterAcceptance.body.data.items.some(
        (item: { type: string }) =>
          item.type === "business.membership.activated",
      ),
    ).toBe(true);

    const readAllResponse = await recipientAgent.patch(
      "/api/me/notifications/read-all",
    );
    expect(readAllResponse.status).toBe(200);
    expect(readAllResponse.body.data.updatedCount).toBeGreaterThanOrEqual(1);

    const forbiddenSentList = await recipientAgent.get(
      `/api/businesses/${businessId}/invites`,
    );
    expect(forbiddenSentList.status).toBe(403);
  });

  it("manages custom roles without allowing permission escalation", async () => {
    const listResponse = await ownerAgent.get(
      `/api/businesses/${businessId}/roles?page=1&limit=20`,
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.pagination.total).toBeGreaterThanOrEqual(2);

    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/roles`)
      .send({
        name: "Invoice Reviewer",
        permissions: ["members:view", "invoices:view"],
        deniedPermissions: ["invoices:view"],
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.type).toBe("custom");
    const roleId = createResponse.body.data.id as string;

    const detailResponse = await ownerAgent.get(
      `/api/businesses/${businessId}/roles/${roleId}`,
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(roleId);

    const updateResponse = await ownerAgent
      .patch(`/api/businesses/${businessId}/roles/${roleId}`)
      .send({ name: "Updated Invoice Reviewer" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.name).toBe("Updated Invoice Reviewer");

    const escalationResponse = await delegatedAgent
      .post(`/api/businesses/${businessId}/roles`)
      .send({
        name: "Escalated Finance Role",
        permissions: ["invoices:create"],
      });
    expect(escalationResponse.status).toBe(403);

    const systemRoleUpdate = await ownerAgent
      .patch(`/api/businesses/${businessId}/roles/${viewerRoleId}`)
      .send({ name: "Changed Viewer" });
    expect(systemRoleUpdate.status).toBe(404);

    const archiveResponse = await ownerAgent.delete(
      `/api/businesses/${businessId}/roles/${roleId}`,
    );
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.data.status).toBe("archived");
  });

  it("lets the recipient reject an invitation", async () => {
    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({ email: rejectedEmail, roleId: viewerRoleId });
    expect(createResponse.status).toBe(201);

    const inviteId = createResponse.body.data.id as string;
    const rejectResponse = await rejectedAgent.post(
      `/api/me/business-invites/${inviteId}/reject`,
    );
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.data.status).toBe("rejected");

    const ownerNotifications = await ownerAgent.get(
      "/api/me/notifications?unreadOnly=true",
    );
    expect(ownerNotifications.status).toBe(200);
    expect(
      ownerNotifications.body.data.items.some(
        (item: { type: string }) => item.type === "business.invite.declined",
      ),
    ).toBe(true);
  });

  it("requires approval when the inviter cannot assign the selected role", async () => {
    const assignableResponse = await delegatedAgent.get(
      `/api/businesses/${businessId}/roles/assignable?page=1&limit=100`,
    );
    expect(assignableResponse.status).toBe(200);
    expect(
      assignableResponse.body.data.items.some(
        (role: { key: string }) => role.key === "owner",
      ),
    ).toBe(false);
    const viewerOption = assignableResponse.body.data.items.find(
      (role: { id: string }) => role.id === viewerRoleId,
    );
    expect(viewerOption.requiresApproval).toBe(true);

    const createResponse = await delegatedAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({ email: approvalEmail, roleId: viewerRoleId });
    expect(createResponse.status).toBe(201);
    const inviteId = createResponse.body.data.id as string;

    const acceptResponse = await approvalAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("pending");
    expect(acceptResponse.body.meta.membershipCreated).toBe(false);
    expect(
      await BusinessMember.exists({ businessId, userId: approvalUserId }),
    ).toBeNull();

    const duplicateOpenInvite = await delegatedAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({ email: approvalEmail, roleId: viewerRoleId });
    expect(duplicateOpenInvite.status).toBe(409);

    const pendingResponse = await ownerAgent.get(
      `/api/businesses/${businessId}/invites/pending-approval`,
    );
    expect(pendingResponse.status).toBe(200);
    expect(pendingResponse.body.data.items[0].id).toBe(inviteId);

    const forbiddenApproval = await delegatedAgent.post(
      `/api/businesses/${businessId}/invites/${inviteId}/approve`,
    );
    expect(forbiddenApproval.status).toBe(403);

    const approvalResponse = await ownerAgent.post(
      `/api/businesses/${businessId}/invites/${inviteId}/approve`,
    );
    expect(approvalResponse.status).toBe(200);
    expect(approvalResponse.body.data.approvalStatus).toBe("approved");
    expect(
      await BusinessMember.exists({ businessId, userId: approvalUserId }),
    ).not.toBeNull();
  });

  it("allows an authorized approver to reject a pending role approval", async () => {
    const createResponse = await delegatedAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({ email: rejectedEmail, roleId: viewerRoleId });
    expect(createResponse.status).toBe(201);
    const inviteId = createResponse.body.data.id as string;

    const acceptResponse = await rejectedAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("pending");

    const rejectionResponse = await ownerAgent.post(
      `/api/businesses/${businessId}/invites/${inviteId}/reject-approval`,
    );
    expect(rejectionResponse.status).toBe(200);
    expect(rejectionResponse.body.data.approvalStatus).toBe("rejected");
    expect(
      await BusinessMember.exists({ businessId, userId: rejectedUserId }),
    ).toBeNull();
  });

  it("accepts an employee invite directly when the inviter can assign and link it", async () => {
    const employee = await Employee.create({
      businessId,
      employeeListId,
      fullName: "Direct Employee",
      jobTitle: "Analyst",
      bankCode: "058",
      bankName: "Test Bank",
      accountNumber: "1000000001",
      amount: 150_000,
      currency: "NGN",
      payFrequency: "monthly",
    });

    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({
        email: directEmployeeEmail,
        roleId: viewerRoleId,
        type: "EMPLOYEE",
        employeeId: employee._id.toString(),
      });
    expect(createResponse.status).toBe(201);

    const acceptResponse = await directEmployeeAgent.post(
      `/api/me/business-invites/${createResponse.body.data.id}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("not_required");
    expect(acceptResponse.body.meta.membershipCreated).toBe(true);
    expect(acceptResponse.body.meta.membershipActivated).toBe(true);
    expect(acceptResponse.body.meta.requiresApproval).toBe(false);

    const membership = await BusinessMember.findOne({
      businessId,
      userId: directEmployeeUserId,
    });
    expect(membership).not.toBeNull();
    expect((await Employee.findById(employee._id))?.businessMemberId?.toString()).toBe(
      membership!._id.toString(),
    );
  });

  it("requires employee details at approval even when the inviter can assign the role", async () => {
    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({
        email: ownerCreatedEmployeeEmail,
        roleId: viewerRoleId,
        type: "EMPLOYEE",
      });
    expect(createResponse.status).toBe(201);

    const inviteId = createResponse.body.data.id as string;
    const acceptResponse = await ownerCreatedEmployeeAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("pending");
    expect(acceptResponse.body.meta.membershipCreated).toBe(false);
    expect(acceptResponse.body.meta.membershipActivated).toBe(false);
    expect(acceptResponse.body.meta.requiresApproval).toBe(true);

    const missingEmployeeResponse = await ownerAgent.post(
      `/api/businesses/${businessId}/invites/${inviteId}/approve`,
    );
    expect(missingEmployeeResponse.status).toBe(400);

    const approvalResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites/${inviteId}/approve`)
      .send({
        employee: {
          employeeListId,
          fullName: "Owner Created Employee",
          jobTitle: "Intern",
          bankCode: "058",
          bankName: "Test Bank",
          accountNumber: "1000000002",
          amount: 75_000,
          currency: "NGN",
          payFrequency: "monthly",
        },
      });
    expect(approvalResponse.status).toBe(200);
    expect(approvalResponse.body.data.approvalStatus).toBe("approved");

    const membership = await BusinessMember.findOne({
      businessId,
      userId: ownerCreatedEmployeeUserId,
    });
    const employee = await Employee.findOne({
      businessId,
      businessMemberId: membership?._id,
    });
    expect(membership).not.toBeNull();
    expect(employee?.fullName).toBe("Owner Created Employee");
    expect(approvalResponse.body.data.employeeId.id).toBe(
      employee!._id.toString(),
    );
  });

  it("requires approval to link an existing employee when the inviter cannot assign the role", async () => {
    const employee = await Employee.create({
      businessId,
      employeeListId,
      fullName: "Delegated Existing Employee",
      bankCode: "058",
      bankName: "Test Bank",
      accountNumber: "1000000003",
      amount: 90_000,
      currency: "NGN",
    });
    const createResponse = await delegatedAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({
        email: delegatedEmployeeEmail,
        roleId: viewerRoleId,
        type: "EMPLOYEE",
        employeeId: employee._id.toString(),
      });
    expect(createResponse.status).toBe(201);

    const inviteId = createResponse.body.data.id as string;
    const acceptResponse = await delegatedEmployeeAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("pending");
    expect((await Employee.findById(employee._id))?.businessMemberId).toBeNull();

    const pendingResponse = await ownerAgent.get(
      `/api/businesses/${businessId}/invites/pending-approval`,
    );
    const pendingInvite = pendingResponse.body.data.items.find(
      (invite: { id: string }) => invite.id === inviteId,
    );
    expect(pendingInvite.employeeId).toMatchObject({
      id: employee._id.toString(),
      fullName: "Delegated Existing Employee",
    });

    const approvalResponse = await ownerAgent.post(
      `/api/businesses/${businessId}/invites/${inviteId}/approve`,
    );
    expect(approvalResponse.status).toBe(200);
    const membership = await BusinessMember.findOne({
      businessId,
      userId: delegatedEmployeeUserId,
    });
    expect((await Employee.findById(employee._id))?.businessMemberId?.toString()).toBe(
      membership!._id.toString(),
    );
  });

  it("creates the employee during approval when neither role nor employee setup was delegated", async () => {
    const createResponse = await delegatedAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({
        email: delegatedCreatedEmployeeEmail,
        roleId: viewerRoleId,
        type: "EMPLOYEE",
      });
    expect(createResponse.status).toBe(201);

    const inviteId = createResponse.body.data.id as string;
    const acceptResponse = await delegatedCreatedEmployeeAgent.post(
      `/api/me/business-invites/${inviteId}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("pending");

    const approvalResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites/${inviteId}/approve`)
      .send({
        employee: {
          employeeListId,
          fullName: "Delegated Created Employee",
          bankCode: "058",
          bankName: "Test Bank",
          accountNumber: "1000000004",
          amount: 80_000,
        },
      });
    expect(approvalResponse.status).toBe(200);

    const membership = await BusinessMember.findOne({
      businessId,
      userId: delegatedCreatedEmployeeUserId,
    });
    expect(
      await Employee.exists({
        businessId,
        businessMemberId: membership?._id,
        fullName: "Delegated Created Employee",
      }),
    ).not.toBeNull();
  });

  it("links an employee to an existing member without replacing their role", async () => {
    const membership = await BusinessMember.create({
      businessId,
      userId: existingMemberEmployeeUserId,
      roleId: viewerRoleId,
      invitedByUserId: ownerUserId,
    });
    const employee = await Employee.create({
      businessId,
      employeeListId,
      fullName: "Existing Member Employee",
      jobTitle: "Intern",
      bankCode: "058",
      bankName: "Test Bank",
      accountNumber: "1000000005",
      amount: 60_000,
      currency: "NGN",
    });

    const createResponse = await ownerAgent
      .post(`/api/businesses/${businessId}/invites`)
      .send({
        email: existingMemberEmployeeEmail,
        roleId: viewerRoleId,
        type: "EMPLOYEE",
        employeeId: employee._id.toString(),
      });
    expect(createResponse.status).toBe(201);

    const acceptResponse = await existingMemberEmployeeAgent.post(
      `/api/me/business-invites/${createResponse.body.data.id}/accept`,
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.data.approvalStatus).toBe("not_required");
    expect(acceptResponse.body.meta.membershipCreated).toBe(false);
    expect(acceptResponse.body.meta.membershipActivated).toBe(true);

    const memberships = await BusinessMember.find({
      businessId,
      userId: existingMemberEmployeeUserId,
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]._id.toString()).toBe(membership._id.toString());
    expect(memberships[0].roleId.toString()).toBe(viewerRoleId);
    expect((await Employee.findById(employee._id))?.businessMemberId?.toString()).toBe(
      membership._id.toString(),
    );
  });
});
