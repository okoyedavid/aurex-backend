import { afterEach, describe, expect, it, vi } from "vitest";
import { createWarpDemoSessionStore, WarpDemoBusyError, WarpDemoMutationLimitError, WarpDemoRunConflictError, WarpDemoSessionExpiredError } from "./warp-demo-session.store.js";
import { MemoryWarpDemoRedis } from "./warp-demo-test-redis.js";

describe("Warp demo session store", () => {
  afterEach(() => vi.useRealTimers());
  it("creates an unpredictable expiring exclusive session", async () => {
    const redis = new MemoryWarpDemoRedis();
    const store = createWarpDemoSessionStore({ redis, sessionTtlSeconds: 900, maxMutations: 2 });
    const first = await store.createSession();
    expect(first.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(store.createSession()).rejects.toBeInstanceOf(WarpDemoBusyError);
    await store.closeSession(first.id);
    const second = await store.createSession();
    expect(second.id).not.toBe(first.id);
  });
  it("rejects invalid and expired sessions", async () => {
    vi.useFakeTimers();
    const redis = new MemoryWarpDemoRedis();
    const store = createWarpDemoSessionStore({ redis, sessionTtlSeconds: 300, maxMutations: 2 });
    await expect(store.getSession("missing")).rejects.toBeInstanceOf(WarpDemoSessionExpiredError);
    const session = await store.createSession();
    vi.advanceTimersByTime(301_000);
    await expect(store.getSession(session.id)).rejects.toBeInstanceOf(WarpDemoSessionExpiredError);
  });
  it("allows one in-flight run and enforces the session mutation limit", async () => {
    const redis = new MemoryWarpDemoRedis();
    const store = createWarpDemoSessionStore({ redis, sessionTtlSeconds: 900, maxMutations: 1 });
    const session = await store.createSession();
    await store.claimRun(session.id, "run-1");
    await expect(store.claimRun(session.id, "run-2")).rejects.toBeInstanceOf(WarpDemoRunConflictError);
    await store.finishRun(session.id, "run-1");
    await expect(store.claimRun(session.id, "run-2")).rejects.toBeInstanceOf(WarpDemoMutationLimitError);
  });
});
