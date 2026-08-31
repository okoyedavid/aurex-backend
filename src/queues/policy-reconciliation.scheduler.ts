import { env } from "../config/env.js";
import { getPolicyQueue } from "./policy-reconciliation.queue.js";

export const registerNightlyPolicyReconciliation = async () => {
  const queue = getPolicyQueue();
  if (!queue) return null;
  return queue.upsertJobScheduler(
    "nightly-policy-reconciliation",
    { pattern: env.POLICY_RECONCILIATION_NIGHTLY_CRON },
    {
      name: "NIGHTLY_RECONCILIATION",
      data: {
        type: "NIGHTLY_RECONCILIATION",
        reason: "nightly_safety_reconciliation",
        requestedAt: new Date().toISOString(),
      },
      opts: { attempts: 5, backoff: { type: "exponential", delay: 5_000 } },
    },
  );
};
