import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { businessRepository } from "../modules/business/business.repository.js";
import { employeeRepository } from "../modules/employee/employee.repository.js";
import { policyRepository } from "../modules/policy/policy.repository.js";
import { policyReconciliationService } from "../modules/policy/policy.module.js";
import {
  externalAccessReconciliationService,
  githubIntegrationRepository,
} from "../modules/github-integration/github-integration.module.js";
import {
  enqueuePolicyReconciliation,
  POLICY_RECONCILIATION_QUEUE,
} from "./policy-reconciliation.queue.js";
import type { PolicyReconciliationJob } from "./policy-reconciliation.types.js";
import { processWarpDemoReconciliation } from "./warp-demo-reconciliation.worker.js";
import { warpDemoProgressService, warpDemoSandboxEngine, warpDemoSessionStore } from "../modules/warp-demo/warp-demo.module.js";

let worker: Worker<PolicyReconciliationJob> | null = null;
let workerConnection: Redis | null = null;

const enqueueEmployeesForBusiness = async (
  job: Job<PolicyReconciliationJob>,
  businessId: string,
  reason: string,
) => {
  let afterId: string | null = null;
  let processed = 0;
  do {
    const employees =
      await employeeRepository.findActiveEmployeesBatchByBusiness(
        businessId,
        afterId,
        env.POLICY_RECONCILIATION_BATCH_SIZE,
      );
    for (const employee of employees) {
      await enqueuePolicyReconciliation({
        type: "RECONCILE_EMPLOYEE",
        businessId,
        employeeId: employee.id,
        reason,
        requestedBy: "requestedBy" in job.data ? job.data.requestedBy : undefined,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    }
    processed += employees.length;
    afterId =
      employees.length === env.POLICY_RECONCILIATION_BATCH_SIZE
        ? employees.at(-1)!.id
        : null;
  } while (afterId);
  return processed;
};

const processJob = async (job: Job<PolicyReconciliationJob>) => {
  const startedAt = Date.now();
  console.info("Policy reconciliation job started", {
    jobId: job.id,
    type: job.data.type,
    businessId: "businessId" in job.data ? job.data.businessId : undefined,
  });
  if (job.data.type === "RECONCILE_WARP_DEMO") {
    return (await processWarpDemoReconciliation(job, {
      sessionStore: warpDemoSessionStore,
      progressService: warpDemoProgressService,
      sandboxEngine: warpDemoSandboxEngine,
    }))!;
  }
  if (job.data.type === "RECONCILE_EMPLOYEE") {
    await policyReconciliationService.reconcileEmployeePolicies({
      businessId: job.data.businessId,
      employeeId: job.data.employeeId,
      asOfDate: new Date(),
      reason: job.data.reason,
      actor: { actorType: "worker" },
      correlationId: job.data.correlationId,
      triggeredByUserId: job.data.requestedBy,
    });
    const grants =
      await externalAccessReconciliationService.syncEmployeeDesiredAccess(
        job.data.businessId,
        job.data.employeeId,
      );
    for (const grant of grants)
      await enqueuePolicyReconciliation({
        type: "ENFORCE_EXTERNAL_ACCESS",
        businessId: job.data.businessId,
        grantId: grant.id,
        desiredRevision: grant.desiredRevision,
        reason: job.data.reason,
        requestedBy: job.data.requestedBy,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    return { employeesProcessed: 1 };
  }
  if (job.data.type === "RECONCILE_EXTERNAL_EMPLOYEE") {
    const grants =
      await externalAccessReconciliationService.syncEmployeeDesiredAccess(
        job.data.businessId,
        job.data.employeeId,
      );
    for (const grant of grants)
      await enqueuePolicyReconciliation({
        type: "ENFORCE_EXTERNAL_ACCESS",
        businessId: job.data.businessId,
        grantId: grant.id,
        desiredRevision: grant.desiredRevision,
        reason: job.data.reason,
        requestedBy: job.data.requestedBy,
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    return { grantsProcessed: grants.length };
  }
  if (job.data.type === "ENFORCE_EXTERNAL_ACCESS") {
    return externalAccessReconciliationService.enforceGrant(
      job.data.businessId,
      job.data.grantId,
      job.data.desiredRevision,
    );
  }
  if (job.data.type === "RECONCILE_EXTERNAL_DRIFT") {
    let afterId: string | null = null;
    let grantsProcessed = 0;
    do {
      const grants = await githubIntegrationRepository.listManagedGrantsBatch(
        job.data.businessId,
        afterId,
        env.POLICY_RECONCILIATION_BATCH_SIZE,
      );
      for (const grant of grants)
        await enqueuePolicyReconciliation({
          type: "ENFORCE_EXTERNAL_ACCESS",
          businessId: job.data.businessId,
          grantId: grant.id,
          desiredRevision: grant.desiredRevision,
          reason: job.data.reason,
          requestedBy: job.data.requestedBy,
          requestedAt: new Date().toISOString(),
          correlationId: job.data.correlationId,
        });
      grantsProcessed += grants.length;
      afterId =
        grants.length === env.POLICY_RECONCILIATION_BATCH_SIZE
          ? grants.at(-1)!.id
          : null;
    } while (afterId);
    return { grantsProcessed };
  }
  if (job.data.type === "RECONCILE_POLICY") {
    const current = await policyRepository.findPolicy(
      job.data.businessId,
      job.data.policyId,
    );
    if (current && current.version !== job.data.policyVersion)
      console.info("Policy reconciliation job observed newer policy version", {
        jobId: job.id,
        policyId: job.data.policyId,
        queuedVersion: job.data.policyVersion,
        currentVersion: current.version,
      });
    return {
      employeesProcessed: await enqueueEmployeesForBusiness(
        job,
        job.data.businessId,
        job.data.reason,
      ),
    };
  }
  if (
    job.data.type === "RECONCILE_CATEGORY" ||
    job.data.type === "RECONCILE_BUSINESS"
  ) {
    return {
      employeesProcessed: await enqueueEmployeesForBusiness(
        job,
        job.data.businessId,
        job.data.reason,
      ),
    };
  }

  let afterId: string | null = null;
  let businessesProcessed = 0;
  do {
    const businesses = await businessRepository.findActiveBusinessesBatch(
      afterId,
      env.POLICY_RECONCILIATION_BATCH_SIZE,
    );
    for (const business of businesses) {
      await enqueuePolicyReconciliation({
        type: "RECONCILE_BUSINESS",
        businessId: business.id,
        reason: "nightly_safety_reconciliation",
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
      await enqueuePolicyReconciliation({
        type: "RECONCILE_EXTERNAL_DRIFT",
        businessId: business.id,
        reason: "nightly_external_access_verification",
        requestedAt: new Date().toISOString(),
        correlationId: job.data.correlationId,
      });
    }
    businessesProcessed += businesses.length;
    afterId =
      businesses.length === env.POLICY_RECONCILIATION_BATCH_SIZE
        ? businesses.at(-1)!.id
        : null;
  } while (afterId);
  console.info("Policy reconciliation job completed", {
    jobId: job.id,
    type: job.data.type,
    businessesProcessed,
    durationMs: Date.now() - startedAt,
  });
  return { businessesProcessed };
};

export const startPolicyReconciliationWorker = () => {
  if (worker || !env.REDIS_URL) return worker;
  workerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  workerConnection.on("error", (error) =>
    console.error("Policy worker Redis connection error", {
      error: error.message,
    }),
  );
  worker = new Worker<PolicyReconciliationJob>(
    POLICY_RECONCILIATION_QUEUE,
    processJob,
    {
      connection: workerConnection,
      concurrency: env.POLICY_RECONCILIATION_CONCURRENCY,
    },
  );
  worker.on("completed", (job, result) =>
    console.info("Policy reconciliation job completed", {
      jobId: job.id,
      type: job.data.type,
      ...result,
    }),
  );
  worker.on("failed", (job, error) =>
    {
      console.error("Policy reconciliation job failed", {
      jobId: job?.id,
      type: job?.data.type,
      attemptsMade: job?.attemptsMade,
      error: error.message,
      });
      const demoRun = job?.data.type === "RECONCILE_WARP_DEMO" ? job.data : null;
      const attempts = job?.opts.attempts ?? 1;
      if (demoRun && (job?.attemptsMade ?? 0) >= attempts) {
        void warpDemoSessionStore.getSession(demoRun.sessionId)
          .then((sandbox) => sandbox.revision === demoRun.revision && sandbox.activeRunId === demoRun.runId
            ? warpDemoProgressService.appendEvent(demoRun.runId, { stage: "complete", status: "failed", title: "Reconciliation could not be completed", description: "Reset the demo scenario and try again." }, "run-failed")
              .then(() => warpDemoProgressService.markFailed(demoRun.runId))
              .then(() => warpDemoSessionStore.finishRun(demoRun.sessionId, demoRun.runId))
            : undefined)
          .catch((progressError) => console.error("Failed to record terminal Warp demo progress", { runId: demoRun.runId, error: progressError instanceof Error ? progressError.message : "unknown" }));
      }
    },
  );
  return worker;
};

export const stopPolicyReconciliationWorker = async () => {
  await worker?.close();
  worker = null;
  if (workerConnection) await workerConnection.quit();
  workerConnection = null;
};
