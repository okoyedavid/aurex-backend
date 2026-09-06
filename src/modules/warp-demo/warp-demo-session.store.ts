import crypto from "node:crypto";

export type WarpDemoSession = {
  id: string;
  employeeAlias: "maya";
  createdAt: string;
  expiresAt: string;
  mutationCount: number;
};

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

const RELEASE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export const createWarpDemoSessionStore = ({
  redis,
  sessionTtlSeconds,
  maxMutations,
}: {
  redis: WarpDemoRedisClient | null;
  sessionTtlSeconds: number;
  maxMutations: number;
}) => {
  const sessionKey = (sessionId: string) => `warp-demo:session:${sessionId}`;
  const activeRunKey = (sessionId: string) => `warp-demo:session:${sessionId}:active-run`;
  const lockKey = "warp-demo:mutation-lock";

  const requireRedis = () => {
    if (!redis) throw new WarpDemoBusyError("The live demo is temporarily unavailable.");
    return redis;
  };

  const createSession = async (): Promise<WarpDemoSession> => {
    const client = requireRedis();
    const id = crypto.randomBytes(32).toString("base64url");
    const acquired = await client.set(lockKey, id, "EX", sessionTtlSeconds, "NX");
    if (acquired !== "OK") throw new WarpDemoBusyError("The live demo is currently in use. Please try again shortly.");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000);
    try {
      await client.hset(sessionKey(id), {
        id,
        employeeAlias: "maya",
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        mutationCount: "0",
      });
      await client.expire(sessionKey(id), sessionTtlSeconds);
    } catch (error) {
      await client.eval(RELEASE_IF_OWNER, 1, lockKey, id).catch(() => undefined);
      throw error;
    }
    return { id, employeeAlias: "maya", createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), mutationCount: 0 };
  };

  const getSession = async (sessionId: string): Promise<WarpDemoSession> => {
    const client = requireRedis();
    const [stored, owner] = await Promise.all([client.hgetall(sessionKey(sessionId)), client.get(lockKey)]);
    if (!stored.id || !stored.createdAt || !stored.expiresAt || owner !== sessionId || new Date(stored.expiresAt).getTime() <= Date.now()) {
      throw new WarpDemoSessionExpiredError("Demo session expired.");
    }
    return {
      id: stored.id,
      employeeAlias: "maya",
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      mutationCount: Number(stored.mutationCount || 0),
    };
  };

  const claimRun = async (sessionId: string, runId: string, countMutation = true) => {
    const client = requireRedis();
    await getSession(sessionId);
    const remainingTtl = await client.ttl(sessionKey(sessionId));
    if (remainingTtl <= 0) throw new WarpDemoSessionExpiredError("Demo session expired.");
    const claimed = await client.set(activeRunKey(sessionId), runId, "EX", remainingTtl, "NX");
    if (claimed !== "OK") throw new WarpDemoRunConflictError("A reconciliation is already in progress.");
    if (countMutation) {
      const count = await client.hincrby(sessionKey(sessionId), "mutationCount", 1);
      if (count > maxMutations) {
        await client.eval(RELEASE_IF_OWNER, 1, activeRunKey(sessionId), runId);
        throw new WarpDemoMutationLimitError("This demo session has reached its change limit.");
      }
    }
  };

  const finishRun = async (sessionId: string, runId: string) => {
    const client = requireRedis();
    await client.eval(RELEASE_IF_OWNER, 1, activeRunKey(sessionId), runId);
  };

  const closeSession = async (sessionId: string) => {
    const client = requireRedis();
    await client.eval(RELEASE_IF_OWNER, 1, lockKey, sessionId);
    await client.del(sessionKey(sessionId), activeRunKey(sessionId));
  };

  return { claimRun, closeSession, createSession, finishRun, getSession };
};

export type WarpDemoSessionStore = ReturnType<typeof createWarpDemoSessionStore>;
