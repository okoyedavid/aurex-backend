import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { User } from "../users/user.models.js";

const createdEmails = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...createdEmails].map((email) => User.deleteOne({ email })),
  );
  createdEmails.clear();
});

const registerAndLogin = async () => {
  const email = `account4-${Date.now()}-${crypto.randomUUID()}@test.local`;
  const password = "Password123!";
  const agent = request.agent(app);

  await agent.post("/api/auth/register").send({
    name: "Account User",
    email,
    password,
  });
  createdEmails.add(email);

  const loginRes = await agent.post("/api/auth/login").send({
    email,
    password,
  });

  expect(loginRes.status).toBe(200);

  return { agent, email };
};

describe("account routes", () => {
  it("creates business business member and role", async () => {
    const { agent } = await registerAndLogin();
    const profile_img =
      "https://res.cloudinary.com/demo/image/upload/v1234567890/aurex/avatar-test.png";

    const updateRes = await agent.post("/api/businesses").send({
      name: "raadaa",
      industry: "technology",
      profile_img,
    });

    expect(updateRes.status).toBe(201);
    expect(updateRes.body.message).toBe("Business Created Successfully");
    expect(updateRes.body.data.id).toEqual(expect.any(String));
    expect(updateRes.body.data._id).toBeUndefined();
    expect(updateRes.body.data.profile_img).toBe(profile_img);

    const listRes = await agent.get("/api/businesses");

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].business.id).toBe(updateRes.body.data.id);
    expect(listRes.body.data[0].business._id).toBeUndefined();
    expect(listRes.body.data[0].membership.status).toBe("active");
    expect(listRes.body.data[0].membership.role.key).toBe("owner");

    const ownerOnlyRes = await agent.get("/api/businesses?ownerOnly=true");

    expect(ownerOnlyRes.status).toBe(200);
    expect(ownerOnlyRes.body.data).toHaveLength(1);
    expect(ownerOnlyRes.body.data[0].business.id).toBe(updateRes.body.data.id);
    expect(ownerOnlyRes.body.data[0].membership).toBeNull();

    const getRes = await agent.get(`/api/businesses/${updateRes.body.data.id}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.business.id).toBe(updateRes.body.data.id);
    expect(getRes.body.data.business._id).toBeUndefined();
    expect(getRes.body.data.membership.role.key).toBe("owner");

    const avatarUrl =
      "https://res.cloudinary.com/image/upload/v1234567890/aurex/avatar-test.png";

    const updateProfileRes = await agent
      .patch("/api/businesses/profile-image")
      .send({
        profile_img: avatarUrl,
        businessId: updateRes.body.data.id,
      });

    expect(updateProfileRes.status).toBe(200);
    expect(updateProfileRes.body.message).toBe(
      "Business profile Image updated successfully",
    );
    expect(updateProfileRes.body.data.profile_img).toBe(avatarUrl);

    const deleteRes = await agent
      .delete("/api/businesses/profile-image")
      .send({ businessId: updateRes.body.data.id });

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe(
      "Business profile image deleted successfully",
    );
    expect(deleteRes.body.data.profile_img).toBeNull();
  });
});

