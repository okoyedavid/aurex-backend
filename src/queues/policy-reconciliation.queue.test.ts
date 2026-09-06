import { describe, expect, it } from "vitest";
import { policyReconciliationJobId } from "./policy-reconciliation.queue.js";

const base = {
  businessId: "b1",
  reason: "test",
  requestedAt: "2026-08-31T10:00:00.000Z",
};

describe("policy reconciliation job identity", () => {
  it("coalesces the same policy version", () => {
    const job = { ...base, type: "RECONCILE_POLICY" as const, policyId: "p1", policyVersion: 7 };
    expect(policyReconciliationJobId(job)).toBe(policyReconciliationJobId({ ...job }));
  });

  it("does not allow a newer policy version to be hidden by an older job", () => {
    const oldJob = { ...base, type: "RECONCILE_POLICY" as const, policyId: "p1", policyVersion: 7 };
    expect(policyReconciliationJobId(oldJob)).not.toBe(policyReconciliationJobId({ ...oldJob, policyVersion: 8 }));
  });

  it("preserves distinct employee change requests", () => {
    const job = { ...base, type: "RECONCILE_EMPLOYEE" as const, employeeId: "e1" };
    expect(policyReconciliationJobId(job)).not.toBe(policyReconciliationJobId({ ...job, requestedAt: "2026-08-31T10:00:00.001Z" }));
  });

  it("coalesces duplicate external enforcement for the same desired revision", () => {
    const job = { ...base, type: "ENFORCE_EXTERNAL_ACCESS" as const, grantId: "g1", desiredRevision: 4 };
    expect(policyReconciliationJobId(job)).toBe(policyReconciliationJobId({ ...job, requestedAt: "2026-08-31T10:05:00.000Z" }));
    expect(policyReconciliationJobId(job)).not.toBe(policyReconciliationJobId({ ...job, desiredRevision: 5 }));
  });
});
