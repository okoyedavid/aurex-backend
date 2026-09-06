import crypto from "node:crypto";
import type { PolicyRuleCondition } from "../policy-rule/policy-rule.model.js";
import type { AssignmentSnapshot } from "../policy/policy-assignment-transition.js";

export type SandboxEmployee = { id: string; fullName: string; jobTitle: string | null; employeeListId: string; employeeTypeId: string | null; groupIds: string[]; state: string | null; status: string; employmentStartDate: string | null };
export type SandboxDimension = { id: string; name: string; status: string };
export type SandboxCategory = { id: string; name: string; description: string | null; cardinality: "ONE" | "MANY"; status: string };
export type SandboxPolicy = { id: string; categoryId: string; name: string; description: string | null; version: number; status: string; effectiveFrom: string | null; effectiveTo: string | null; configuration?: Record<string, unknown> };
export type SandboxRule = { id: string; policyId: string; name: string | null; conditions: PolicyRuleCondition[]; priority: number; version: number; status: string; effectiveFrom: string | null; effectiveTo: string | null };
export type WarpDemoSeed = { businessId: string; employee: SandboxEmployee; departments: SandboxDimension[]; employeeTypes: SandboxDimension[]; groups: SandboxDimension[]; categories: SandboxCategory[]; policies: SandboxPolicy[]; rules: SandboxRule[] };
export type SandboxAudit = { id: string; occurredAt: string; employeeId: string; policyId?: string; categoryId?: string; action: string; entityType: string; actorType: "demo" | "worker"; reason?: string; correlationId: string };
export type SerializedAssignment = Omit<AssignmentSnapshot, "effectiveFrom" | "effectiveTo" | "resolvedAt"> & { effectiveFrom: string; effectiveTo: string | null; resolvedAt: string };
export type WarpDemoSandbox = { id: string; createdAt: string; expiresAt: string; mutationCount: number; revision: number; activeRunId: string | null; seed: WarpDemoSeed; baselineEmployee: SandboxEmployee; employee: SandboxEmployee; assignments: SerializedAssignment[]; audit: SandboxAudit[] };

export interface WarpDemoRedisClient {
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  get(key: string): Promise<string | null>;
  hset(key: string, values: Record<string, string>): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export class WarpDemoBusyError extends Error {}
export class WarpDemoSessionExpiredError extends Error {}
export class WarpDemoRunConflictError extends Error {}
export class WarpDemoMutationLimitError extends Error {}
export class WarpDemoStaleRunError extends Error {}

const BEGIN_RUN = `
local current = redis.call("HGET", KEYS[1], "revision")
if not current then return {-1, "expired"} end
if tonumber(current) ~= tonumber(ARGV[1]) then return {-2, "stale"} end
local active = redis.call("HGET", KEYS[1], "activeRunId")
if active and active ~= "" and ARGV[5] ~= "1" then return {-3, "active"} end
local count = tonumber(redis.call("HGET", KEYS[1], "mutationCount") or "0")
if ARGV[4] == "1" then count = count + 1 end
if count > tonumber(ARGV[6]) then return {-4, "limit"} end
local revision = tonumber(current) + 1
redis.call("HSET", KEYS[1], "revision", tostring(revision), "activeRunId", ARGV[2], "employee", ARGV[3], "mutationCount", tostring(count))
return {revision, "ok"}
`;
const COMMIT_RUN = `
local current = redis.call("HGET", KEYS[1], "revision")
local active = redis.call("HGET", KEYS[1], "activeRunId")
if not current then return 0 end
if tonumber(current) ~= tonumber(ARGV[1]) or active ~= ARGV[2] then return -1 end
redis.call("HSET", KEYS[1], "assignments", ARGV[3], "audit", ARGV[4], "activeRunId", "")
return 1
`;
const FINISH_RUN = `
if redis.call("HGET", KEYS[1], "activeRunId") == ARGV[1] then
  redis.call("HSET", KEYS[1], "activeRunId", "")
  return 1
end
return 0
`;

export const createWarpDemoSessionStore = ({ redis, sessionTtlSeconds, maxMutations }: { redis: WarpDemoRedisClient | null; sessionTtlSeconds: number; maxMutations: number }) => {
  const key = (sessionId: string) => `warp-demo:session:${sessionId}`;
  const requireRedis = () => { if (!redis) throw new WarpDemoBusyError("The live demo is temporarily unavailable."); return redis; };
  const parse = (stored: Record<string, string>): WarpDemoSandbox => {
    if (!stored.id || !stored.createdAt || !stored.expiresAt || !stored.seed || !stored.employee || !stored.baselineEmployee) throw new WarpDemoSessionExpiredError("Demo session expired.");
    return { id: stored.id, createdAt: stored.createdAt, expiresAt: stored.expiresAt, mutationCount: Number(stored.mutationCount), revision: Number(stored.revision), activeRunId: stored.activeRunId || null, seed: JSON.parse(stored.seed), baselineEmployee: JSON.parse(stored.baselineEmployee), employee: JSON.parse(stored.employee), assignments: JSON.parse(stored.assignments || "[]"), audit: JSON.parse(stored.audit || "[]") };
  };
  const getSession = async (sessionId: string) => {
    const stored = await requireRedis().hgetall(key(sessionId));
    if (!stored.id || !stored.expiresAt || new Date(stored.expiresAt).getTime() <= Date.now()) throw new WarpDemoSessionExpiredError("Demo session expired.");
    return parse(stored);
  };
  const createSession = async (seed: WarpDemoSeed) => {
    const client = requireRedis();
    const id = crypto.randomBytes(32).toString("base64url");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000);
    const employee = JSON.stringify(seed.employee);
    await client.hset(key(id), { id, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), mutationCount: "0", revision: "0", activeRunId: "", seed: JSON.stringify(seed), baselineEmployee: employee, employee, assignments: "[]", audit: "[]" });
    await client.expire(key(id), sessionTtlSeconds);
    return getSession(id);
  };
  const beginRun = async ({ sessionId, runId, expectedRevision, employee, countMutation = true, supersede = false }: { sessionId: string; runId: string; expectedRevision: number; employee: SandboxEmployee; countMutation?: boolean; supersede?: boolean }) => {
    const result = await requireRedis().eval(BEGIN_RUN, 1, key(sessionId), expectedRevision, runId, JSON.stringify(employee), countMutation ? "1" : "0", supersede ? "1" : "0", maxMutations) as [number, string];
    const code = Number(result?.[0]);
    if (code === -1) throw new WarpDemoSessionExpiredError("Demo session expired.");
    if (code === -2) throw new WarpDemoStaleRunError("Demo state changed. Try again.");
    if (code === -3) throw new WarpDemoRunConflictError("A reconciliation is already in progress.");
    if (code === -4) throw new WarpDemoMutationLimitError("This demo session has reached its change limit.");
    return code;
  };
  const commitRun = async ({ sessionId, runId, revision, assignments, audit }: { sessionId: string; runId: string; revision: number; assignments: SerializedAssignment[]; audit: SandboxAudit[] }) => {
    const result = Number(await requireRedis().eval(COMMIT_RUN, 1, key(sessionId), revision, runId, JSON.stringify(assignments), JSON.stringify(audit)));
    if (result === 0) throw new WarpDemoSessionExpiredError("Demo session expired.");
    if (result !== 1) throw new WarpDemoStaleRunError("Demo reconciliation was superseded.");
  };
  const finishRun = async (sessionId: string, runId: string) => { await requireRedis().eval(FINISH_RUN, 1, key(sessionId), runId); };
  const closeSession = (sessionId: string) => requireRedis().del(key(sessionId));
  return { beginRun, closeSession, commitRun, createSession, finishRun, getSession };
};

export type WarpDemoSessionStore = ReturnType<typeof createWarpDemoSessionStore>;
