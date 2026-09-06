import crypto from "node:crypto";
import type { WarpDemoRedisClient } from "./warp-demo-session.store.js";

export type WarpDemoRunStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed";
export type WarpDemoProgressStage = "employee_update" | "queued" | "policy_resolution" | "assignment_reconciliation" | "external_access" | "audit" | "complete";
export type WarpDemoProgressEventStatus = "pending" | "running" | "success" | "warning" | "failed";
export type WarpDemoProgressEvent = {
  id: string;
  stage: WarpDemoProgressStage;
  status: WarpDemoProgressEventStatus;
  title: string;
  description: string;
  occurredAt: string;
};

export const createWarpDemoProgressService = ({ redis, runTtlSeconds }: { redis: WarpDemoRedisClient | null; runTtlSeconds: number }) => {
  const runKey = (runId: string) => `warp-demo:run:${runId}`;
  const eventsKey = (runId: string) => `warp-demo:run:${runId}:events`;
  const eventKey = (runId: string, dedupeKey: string) => `warp-demo:run:${runId}:event:${dedupeKey}`;
  const requireRedis = () => {
    if (!redis) throw new Error("Warp demo progress storage is unavailable");
    return redis;
  };

  const appendEvent = async (runId: string, event: Omit<WarpDemoProgressEvent, "id" | "occurredAt">, dedupeKey?: string) => {
    const client = requireRedis();
    if (dedupeKey) {
      const accepted = await client.set(eventKey(runId, dedupeKey), "1", "EX", runTtlSeconds, "NX");
      if (accepted !== "OK") return null;
    }
    const value: WarpDemoProgressEvent = { id: crypto.randomUUID(), ...event, occurredAt: new Date().toISOString() };
    await client.rpush(eventsKey(runId), JSON.stringify(value));
    await Promise.all([client.expire(runKey(runId), runTtlSeconds), client.expire(eventsKey(runId), runTtlSeconds)]);
    return value;
  };

  const createRun = async ({ runId, sessionId }: { runId: string; sessionId: string }) => {
    const client = requireRedis();
    const now = new Date().toISOString();
    await client.hset(runKey(runId), { id: runId, sessionId, status: "queued", createdAt: now, startedAt: "", completedAt: "", durationMs: "", updatedAt: now, changedResources: "[]" });
    await client.expire(runKey(runId), runTtlSeconds);
    return runId;
  };

  const markRunning = async (runId: string) => {
    const client = requireRedis();
    const current = await client.hgetall(runKey(runId));
    if (!current.id || ["completed", "completed_with_warnings", "failed"].includes(current.status ?? "")) return false;
    const now = new Date().toISOString();
    await client.hset(runKey(runId), { status: "running", startedAt: current.startedAt || now, updatedAt: now });
    await client.expire(runKey(runId), runTtlSeconds);
    return true;
  };

  const markTerminal = async (runId: string, status: Extract<WarpDemoRunStatus, "completed" | "completed_with_warnings" | "failed">, changedResources: string[]) => {
    const client = requireRedis();
    const current = await client.hgetall(runKey(runId));
    if (!current.id) return false;
    const completedAt = new Date();
    const startedAt = current.startedAt ? new Date(current.startedAt) : new Date(current.createdAt ?? completedAt);
    await client.hset(runKey(runId), { status, completedAt: completedAt.toISOString(), durationMs: String(Math.max(0, completedAt.getTime() - startedAt.getTime())), updatedAt: completedAt.toISOString(), changedResources: JSON.stringify(changedResources) });
    await Promise.all([client.expire(runKey(runId), runTtlSeconds), client.expire(eventsKey(runId), runTtlSeconds)]);
    return true;
  };

  const markCompleted = (runId: string, changedResources: string[], warnings = false) => markTerminal(runId, warnings ? "completed_with_warnings" : "completed", changedResources);
  const markFailed = (runId: string) => markTerminal(runId, "failed", []);

  const getRun = async (sessionId: string, runId: string) => {
    const client = requireRedis();
    const [run, rawEvents] = await Promise.all([client.hgetall(runKey(runId)), client.lrange(eventsKey(runId), 0, -1)]);
    if (!run.id || run.sessionId !== sessionId) return null;
    return {
      id: run.id,
      status: run.status as WarpDemoRunStatus,
      createdAt: run.createdAt,
      startedAt: run.startedAt || null,
      completedAt: run.completedAt || null,
      durationMs: run.durationMs ? Number(run.durationMs) : null,
      updatedAt: run.updatedAt,
      events: rawEvents.map((item) => JSON.parse(item) as WarpDemoProgressEvent),
      changedResources: JSON.parse(run.changedResources || "[]") as string[],
      pollAfterMs: 750,
    };
  };

  return { appendEvent, createRun, getRun, markCompleted, markFailed, markRunning };
};

export type WarpDemoProgressService = ReturnType<typeof createWarpDemoProgressService>;
