import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { createHttpError } from "../../utils/api-error.js";
import { enqueuePolicyReconciliation } from "../../queues/policy-reconciliation.queue.js";
import { policyResolver } from "../policy/policy.module.js";
import { createWarpDemoController } from "./warp-demo.controller.js";
import { warpDemoRepository } from "./warp-demo.repository.js";
import { createWarpDemoService } from "./warp-demo.service.js";
import { createWarpDemoProgressService } from "./warp-demo-progress.service.js";
import { createWarpDemoSandboxEngine } from "./warp-demo-sandbox.engine.js";
import { createWarpDemoSessionStore, type WarpDemoRedisClient } from "./warp-demo-session.store.js";

const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true }) : null;
redis?.on("error", (error) => console.error("Warp demo Redis connection error", { error: error.message }));
const demoRedis = redis as unknown as WarpDemoRedisClient | null;
const createPublicDemoError = (message: string, statusCode: number) => Object.assign(createHttpError(message, statusCode), { isOperational: true });

export const warpDemoSessionStore = createWarpDemoSessionStore({ redis: demoRedis, sessionTtlSeconds: env.WARP_DEMO_SESSION_TTL_SECONDS, maxMutations: env.WARP_DEMO_MAX_MUTATIONS_PER_SESSION });
export const warpDemoProgressService = createWarpDemoProgressService({ redis: demoRedis, runTtlSeconds: env.WARP_DEMO_RUN_TTL_SECONDS });
export const warpDemoSandboxEngine = createWarpDemoSandboxEngine({ store: warpDemoSessionStore, createHttpError: createPublicDemoError });
export const warpDemoService = createWarpDemoService({ repository: warpDemoRepository, resolver: policyResolver, businessId: env.WARP_DEMO_BUSINESS_ID, createHttpError: createPublicDemoError, sessionStore: warpDemoSessionStore, sandboxEngine: warpDemoSandboxEngine, progressService: warpDemoProgressService, enqueueReconciliation: enqueuePolicyReconciliation });
export const warpDemoController = createWarpDemoController(warpDemoService);
