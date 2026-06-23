import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { User } from "../users/user.models.js";

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
});

afterAll(async () => {
  await User.deleteMany({ email: /@test\.local$/ });
  await mongoose.disconnect();
});

describe("POST /api/auth/register", () => {
  it("registers a user then logs in", async () => {
    const email = `test-${Date.now()}@test.local`;
    const password = "Password123!";
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send({
      name: "Test User",
      email,
      password,
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("User registered");

    const loginRes = await agent.post("/api/auth/login").send({
      email,
      password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.message).toContain("Login successful");
    expect(loginRes.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("accessToken="),
        expect.stringContaining("refreshToken="),
      ]),
    );

    const changeEmailRes = await agent.post("/api/me/email/change").send({
      newEmail: `new-${Date.now()}@test.local`,
    });

    expect(changeEmailRes.status).toBe(201);

    const refreshRes = await agent.post("/api/auth/refresh").send({});
    expect(refreshRes.status).toBe(200);

    const updateres = await agent
      .patch("/api/me")
      .send({ name: "david", username: "david11", bio: "hello there" });

    expect(updateres.status).toBe(200);

    const changePasswordRes = await agent
      .patch("/api/me/password")
      .send({ newPassword: "Hellothere8*", currentPassword: password });

    expect(changePasswordRes.status).toBe(200);

    // logout uses refreshToken cookie
    const logoutRes = await agent.post("/api/auth/logout").send({});
    expect(logoutRes.status).toBe(200);

    const protectedRes = await agent.post("/api/me/email/change").send({
      newEmail: `after-logout-${Date.now()}@test.local`,
    });

    expect(protectedRes.status).toBe(401);
  });
});

vi.setConfig({
  testTimeout: 30_000,
  hookTimeout: 30_000,
});
