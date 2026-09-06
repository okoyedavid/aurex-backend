import { afterEach, describe, expect, it, vi } from "vitest";
import { createWarpDemoProgressService } from "./warp-demo-progress.service.js";
import { MemoryWarpDemoRedis } from "./warp-demo-test-redis.js";

describe("Warp demo reconciliation progress", () => {
  afterEach(() => vi.useRealTimers());
  it("stores ordered append-only events and terminal timing", async () => {
    vi.useFakeTimers();
    const redis = new MemoryWarpDemoRedis();
    const service = createWarpDemoProgressService({ redis, runTtlSeconds: 1800 });
    await service.createRun({ runId: "run-1", sessionId: "session-1" });
    expect(await service.getRun("session-1", "run-1")).toMatchObject({ status: "queued", events: [] });
    await service.markRunning("run-1");
    await service.appendEvent("run-1", { stage: "employee_update", status: "success", title: "Employee updated", description: "Department changed from Engineering to Finance." }, "employee");
    vi.advanceTimersByTime(25);
    await service.appendEvent("run-1", { stage: "policy_resolution", status: "success", title: "Policies recalculated", description: "21 active rules were evaluated." }, "policies");
    await service.appendEvent("run-1", { stage: "policy_resolution", status: "success", title: "Duplicate", description: "Must not appear." }, "policies");
    await service.markCompleted("run-1", ["employee", "assignments", "audit"]);
    const run = await service.getRun("session-1", "run-1");
    expect(run).toMatchObject({ status: "completed", durationMs: 25, changedResources: ["employee", "assignments", "audit"] });
    expect(run?.events.map((event) => event.title)).toEqual(["Employee updated", "Policies recalculated"]);
    expect(JSON.stringify(run)).not.toMatch(/RECONCILE_EMPLOYEE|BullMQ|warp-demo:run|ObjectId/);
    expect(await service.getRun("another-session", "run-1")).toBeNull();
  });
  it("represents terminal failure and expires progress", async () => {
    vi.useFakeTimers();
    const redis = new MemoryWarpDemoRedis();
    const service = createWarpDemoProgressService({ redis, runTtlSeconds: 900 });
    await service.createRun({ runId: "run-2", sessionId: "session-1" });
    await service.markRunning("run-2");
    await service.appendEvent("run-2", { stage: "complete", status: "failed", title: "Reconciliation could not be completed", description: "Reset and try again." }, "failed");
    await service.markFailed("run-2");
    expect(await service.getRun("session-1", "run-2")).toMatchObject({ status: "failed", completedAt: expect.any(String), durationMs: 0 });
    vi.advanceTimersByTime(901_000);
    expect(await service.getRun("session-1", "run-2")).toBeNull();
  });
});
