import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { AuditEvent } from "../audit-event/audit-event.model.js";
import { Business } from "../business/business.model.js";
import { Notification } from "../notification/notification.model.js";
import { Role, systemRolePermissions } from "../role/role.model.js";
import { User } from "../users/user.models.js";
import { BusinessMember } from "./business-member.model.js";

describe("business member mutation routes", () => {
  const password = "Password123!";
  const ownerEmail = `member-owner-${crypto.randomUUID()}@test.local`;
  const managerEmail = `member-manager-${crypto.randomUUID()}@test.local`;
  const targetEmail = `member-target-${crypto.randomUUID()}@test.local`;
  const ownerAgent = request.agent(app);
  const managerAgent = request.agent(app);
  let businessId: string;
  let ownerUserId: string;
  let managerUserId: string;
  let targetUserId: string;
  let ownerMemberId: string;
  let managerMemberId: string;
  let targetMemberId: string;
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
      { key: "admin", name: "Admin" },
      { key: "viewer", name: "Viewer" },
    ] as const) {
      await Role.updateOne(
        { key: role.key, type: "system", businessId: null },
        {
          $set: {
            ...role,
            type: "system",
            businessId: null,
            status: "active",
            permissions: systemRolePermissions[role.key],
            deniedPermissions: [],
          },
        },
        { upsert: true },
      );
    }

    await registerAndLogin(ownerAgent, "Member Owner", ownerEmail);
    await registerAndLogin(managerAgent, "Member Manager", managerEmail);
    const targetUser = await User.create({
      name: "Admin Target",
      email: targetEmail,
    });
    targetUserId = targetUser._id.toString();

    const [ownerUser, managerUser, adminRole, viewerRole] = await Promise.all([
      User.findOne({ email: ownerEmail }),
      User.findOne({ email: managerEmail }),
      Role.findOne({ key: "admin", type: "system", businessId: null }),
      Role.findOne({ key: "viewer", type: "system", businessId: null }),
    ]);
    expect(ownerUser).not.toBeNull();
    expect(managerUser).not.toBeNull();
    expect(adminRole).not.toBeNull();
    expect(viewerRole).not.toBeNull();
    ownerUserId = ownerUser!._id.toString();
    managerUserId = managerUser!._id.toString();
    viewerRoleId = viewerRole!._id.toString();

    const businessResponse = await ownerAgent.post("/api/businesses").send({
      name: `Member Mutation Business ${Date.now()}`,
      industry: "technology",
    });
    expect(businessResponse.status).toBe(201);
    businessId = businessResponse.body.data.id;

    const ownerMembership = await BusinessMember.findOne({
      businessId,
      userId: ownerUserId,
    });
    expect(ownerMembership).not.toBeNull();
    ownerMemberId = ownerMembership!._id.toString();

    const managerRole = await Role.create({
      businessId,
      name: "Member Manager",
      key: `member_manager_${Date.now()}`,
      type: "custom",
      permissions: [
        "members:view",
        "members:update_role",
        "members:update_status",
        "members:remove",
        "roles:assign",
      ],
      deniedPermissions: [],
    });
    const [managerMembership, targetMembership] = await Promise.all([
      BusinessMember.create({
        businessId,
        userId: managerUserId,
        roleId: managerRole._id,
        invitedByUserId: ownerUserId,
      }),
      BusinessMember.create({
        businessId,
        userId: targetUserId,
        roleId: adminRole!._id,
        invitedByUserId: ownerUserId,
      }),
    ]);
    managerMemberId = managerMembership._id.toString();
    targetMemberId = targetMembership._id.toString();
  });

  afterAll(async () => {
    await Promise.all([
      Notification.deleteMany({
        userId: { $in: [ownerUserId, managerUserId, targetUserId] },
      }),
      AuditEvent.deleteMany({
        userId: { $in: [ownerUserId, managerUserId, targetUserId] },
      }),
      BusinessMember.deleteMany({ businessId }),
      Role.deleteMany({ businessId }),
      Business.deleteOne({ _id: businessId }),
      User.deleteMany({
        email: { $in: [ownerEmail, managerEmail, targetEmail] },
      }),
    ]);
  });

  it("blocks self, Owner, cross-business, and higher-privilege mutations", async () => {
    const higherPrivilegeResponse = await managerAgent
      .patch(
        `/api/businesses/${businessId}/members/${targetMemberId}/status`,
      )
      .send({ status: "suspended" });
    expect(higherPrivilegeResponse.status).toBe(403);

    const ownerResponse = await managerAgent
      .patch(`/api/businesses/${businessId}/members/${ownerMemberId}/status`)
      .send({ status: "suspended" });
    expect(ownerResponse.status).toBe(403);

    const selfResponse = await managerAgent
      .patch(`/api/businesses/${businessId}/members/${managerMemberId}/status`)
      .send({ status: "suspended" });
    expect(selfResponse.status).toBe(403);

    const foreignBusinessId = new mongoose.Types.ObjectId().toString();
    const crossBusinessResponse = await ownerAgent
      .patch(
        `/api/businesses/${foreignBusinessId}/members/${managerMemberId}/status`,
      )
      .send({ status: "suspended" });
    expect(crossBusinessResponse.status).toBe(403);
  });

  it("updates role and status, then soft-removes the member", async () => {
    const roleResponse = await ownerAgent
      .patch(`/api/businesses/${businessId}/members/${managerMemberId}/role`)
      .send({ roleId: viewerRoleId });
    expect(roleResponse.status).toBe(200);
    expect(roleResponse.body.data.roleId.id).toBe(viewerRoleId);
    expect(roleResponse.body.data.roleUpdatedByUserId.id).toBe(ownerUserId);
    expect(roleResponse.body.data.roleUpdatedAt).not.toBeNull();

    const suspendResponse = await ownerAgent
      .patch(`/api/businesses/${businessId}/members/${managerMemberId}/status`)
      .send({ status: "suspended" });
    expect(suspendResponse.status).toBe(200);
    expect(suspendResponse.body.data.status).toBe("suspended");

    const activateResponse = await ownerAgent
      .patch(`/api/businesses/${businessId}/members/${managerMemberId}/status`)
      .send({ status: "active" });
    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.data.status).toBe("active");

    const removeResponse = await ownerAgent.delete(
      `/api/businesses/${businessId}/members/${managerMemberId}`,
    );
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.data.status).toBe("removed");
    expect(removeResponse.body.data.removedByUserId.id).toBe(ownerUserId);
    expect(removeResponse.body.data.removedAt).not.toBeNull();

    const repeatedMutation = await ownerAgent
      .patch(`/api/businesses/${businessId}/members/${managerMemberId}/status`)
      .send({ status: "active" });
    expect(repeatedMutation.status).toBe(409);

    const notification = await Notification.findOne({
      userId: managerUserId,
      type: "business.member.removed",
    });
    expect(notification).not.toBeNull();
  });
});
