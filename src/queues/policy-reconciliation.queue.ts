import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import type { PolicyReconciliationJob } from "./policy-reconciliation.types.js";

export const POLICY_RECONCILIATION_QUEUE = "policy-reconciliation";

let queue: Queue<PolicyReconciliationJob> | null = null;
let producerConnection: Redis | null = null;
let warnedMissingRedis = false;

export const getPolicyQueue = () => {
  if (!env.REDIS_URL) {
    if (!warnedMissingRedis) {
      console.warn("Policy reconciliation queue disabled: REDIS_URL is not configured");
      warnedMissingRedis = true;
    }
    return null;
  }
  if (!queue) {
    producerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    producerConnection.on("error", (error) =>
      console.error("Policy queue Redis connection error", { error: error.message }),
    );
    queue = new Queue<PolicyReconciliationJob>(POLICY_RECONCILIATION_QUEUE, {
      connection: producerConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        // Immediate removal lets a later source change reuse the deterministic
        // job id, while concurrent duplicate requests still coalesce.
        removeOnComplete: true,
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 20_000 },
      },
    });
  }
  return queue;
};

export const policyReconciliationJobId = (job: PolicyReconciliationJob) => {
  if (job.type === "RECONCILE_EMPLOYEE") {
    const requestVersion = job.requestedAt.replace(/[^0-9]/g, "");
    return `employee-${job.businessId}-${job.employeeId}-${requestVersion}`;
  }
  if (job.type === "RECONCILE_POLICY") return `policy-${job.businessId}-${job.policyId}-v${job.policyVersion}`;
  if (job.type === "RECONCILE_CATEGORY") return `category-${job.businessId}-${job.categoryId}`;
  if (job.type === "RECONCILE_BUSINESS") return `business-${job.businessId}`;
  if (job.type === "RECONCILE_EXTERNAL_EMPLOYEE") return `github-employee-${job.businessId}-${job.employeeId}-${job.requestedAt.replace(/[^0-9]/g, "")}`;
  if (job.type === "ENFORCE_EXTERNAL_ACCESS") return `github-access-${job.businessId}-${job.grantId}-${job.desiredRevision}`;
  if (job.type === "RECONCILE_EXTERNAL_DRIFT") return `github-drift-${job.businessId}-${job.requestedAt.slice(0, 10)}`;
  return "nightly-policy-reconciliation";
};

export const enqueueEmployeeExternalReconciliation = (businessId: string, employeeId: string, reason: string, requestedBy?: string) =>
  enqueuePolicyReconciliation({ type: "RECONCILE_EXTERNAL_EMPLOYEE", businessId, employeeId, reason, requestedBy, requestedAt: new Date().toISOString() });

export const enqueuePolicyReconciliation = async (job: PolicyReconciliationJob) => {
  const policyQueue = getPolicyQueue();
  if (!policyQueue) return null;
  return policyQueue.add(job.type, job, { jobId: policyReconciliationJobId(job) });
};

export const closePolicyQueue = async () => {
  await queue?.close();
  queue = null;
  if (producerConnection) await producerConnection.quit();
  producerConnection = null;
};
