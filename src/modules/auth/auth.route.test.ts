import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

    const res = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email,
      password,
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("User registered");

    const loginRes = await request(app).post("/api/auth/login").send({
      email,
      password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.message).toContain("Login successful");
  });
});
