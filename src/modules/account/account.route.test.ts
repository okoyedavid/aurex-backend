import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  const email = `account-${Date.now()}-${crypto.randomUUID()}@test.local`;
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
  it("updates and deletes avatar", async () => {
    const { agent } = await registerAndLogin();
    const avatarUrl =
      "https://res.cloudinary.com/demo/image/upload/v1234567890/aurex/avatar-test.png";

    const updateRes = await agent.patch("/api/me/avatar").send({
      avatar: avatarUrl,
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toBe("Avatar updated successfully");
    expect(updateRes.body.user.avatar).toBe(avatarUrl);

    const deleteRes = await agent.delete("/api/me/avatar").send({});

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe("Avatar deleted successfully");
    expect(deleteRes.body.user.avatar).toBeNull();
  });

  it("updates account preferences", async () => {
    const { agent } = await registerAndLogin();

    const enableRes = await agent.patch("/api/me/preferences").send({
      preferences: {
        twoFactorEnabled: true,
      },
    });

    expect(enableRes.status).toBe(200);
    expect(enableRes.body.message).toBe("Preferences updated successfully");
    expect(enableRes.body.user.preferences.twoFactorEnabled).toBe(true);

    const disableRes = await agent.patch("/api/me/preferences").send({
      preferences: {
        twoFactorEnabled: false,
      },
    });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.user.preferences.twoFactorEnabled).toBe(false);
  });
});

vi.setConfig({
  testTimeout: 30_000,
  hookTimeout: 30_000,
});
