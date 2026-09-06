import crypto from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { githubIntegrationRepository } from "./github-integration.repository.js";
import { GitHubInstallationAttempt } from "./github-installation-attempt.model.js";

const businessId = "68b000000000000000000001";
const userId = "68b000000000000000000003";
let ownsConnection = false;

describe("GitHub installation attempt repository", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGO_URI);
      ownsConnection = true;
    }
  }, 180_000);

  afterAll(async () => {
    if (ownsConnection) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await GitHubInstallationAttempt.deleteMany({});
  });

  it("persists only the state hash and initiation bindings", async () => {
    const rawState = crypto.randomBytes(32).toString("base64url");
    const stateHash = crypto.createHash("sha256").update(rawState).digest("hex");
    const expiresAt = new Date(Date.now() + 600_000);
    const attempt = await githubIntegrationRepository.createInstallationAttempt({
      stateHash,
      businessId,
      initiatedByUserId: userId,
      initiatedByUserSessionId: "user-session",
      initiatedByAuthSessionId: "auth-session",
      expiresAt,
    });

    expect(attempt).toMatchObject({
      stateHash,
      initiatedByUserSessionId: "user-session",
      initiatedByAuthSessionId: "auth-session",
      status: "pending",
    });
    expect(attempt.toObject()).not.toHaveProperty("state");
    expect(String(attempt.businessId)).toBe(businessId);
    expect(String(attempt.initiatedByUserId)).toBe(userId);
  });

  it("atomically permits only one callback claim and rejects replay", async () => {
    const stateHash = crypto.randomBytes(32).toString("hex");
    const attempt = await githubIntegrationRepository.createInstallationAttempt({
      stateHash,
      businessId,
      initiatedByUserId: userId,
      initiatedByUserSessionId: "user-session",
      expiresAt: new Date(Date.now() + 600_000),
    });

    const claims = await Promise.all([
      githubIntegrationRepository.claimInstallationAttempt(stateHash),
      githubIntegrationRepository.claimInstallationAttempt(stateHash),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    await githubIntegrationRepository.consumeInstallationAttempt(
      String(attempt._id),
    );
    await expect(
      githubIntegrationRepository.claimInstallationAttempt(stateHash),
    ).resolves.toBeNull();
  });

  it("does not claim an expired attempt", async () => {
    const stateHash = crypto.randomBytes(32).toString("hex");
    await githubIntegrationRepository.createInstallationAttempt({
      stateHash,
      businessId,
      initiatedByUserId: userId,
      initiatedByUserSessionId: "user-session",
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(
      githubIntegrationRepository.claimInstallationAttempt(stateHash),
    ).resolves.toBeNull();
  });
});
