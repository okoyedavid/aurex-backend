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

describe("business invitation routes", () => {
  const password = "Password123!";
  const ownerEmail = `invite-owner-${crypto.randomUUID()}@test.local`;
  const recipientEmail = `invite-recipient-${crypto.randomUUID()}@test.local`;
  const rejectedEmail = `invite-rejected-${crypto.randomUUID()}@test.local`;
  const delegatedEmail = `invite-delegated-${crypto.randomUUID()}@test.local`;
  const approvalEmail = `invite-approval-${crypto.randomUUID()}@test.local`;
  const ownerAgent = request.agent(app);
  const recipientAgent = request.agent(app);
  const rejectedAgent = request.agent(app);
  const delegatedAgent = request.agent(app);
  const approvalAgent = request.agent(app);
  let businessId: string;
  let recipientUserId: string;
  let ownerUserId: string;
  let rejectedUserId: string;
  let delegatedUserId: string;
  let approvalUserId: string;
  let viewerRoleId: string;

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

    const [owner, recipient, rejected, delegated, approvalRecipient] =
      await Promise.all([
      User.findOne({ email: ownerEmail }),
      User.findOne({ email: recipientEmail }),
      User.findOne({ email: rejectedEmail }),
        User.findOne({ email: delegatedEmail }),
        User.findOne({ email: approvalEmail }),
      ]);
    expect(owner).not.toBeNull();
    expect(recipient).not.toBeNull();
    expect(rejected).not.toBeNull();
    expect(delegated).not.toBeNull();
    expect(approvalRecipient).not.toBeNull();
    ownerUserId = owner!._id.toString();
    recipientUserId = recipient!._id.toString();
    rejectedUserId = rejected!._id.toString();
    delegatedUserId = delegated!._id.toString();
    approvalUserId = approvalRecipient!._id.toString();

    const response = await ownerAgent.post("/api/businesses").send({
      name: `Invite Business ${Date.now()}`,
      industry: "technology",
    });
    expect(response.status).toBe(201);
    businessId = response.body.data.id;

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
});
