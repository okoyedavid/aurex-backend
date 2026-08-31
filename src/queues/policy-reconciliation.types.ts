export type PolicyJobContext = {
  businessId: string;
  reason: string;
  requestedBy?: string;
  requestedAt: string;
  correlationId?: string;
};

export type PolicyReconciliationJob =
  | ({ type: "RECONCILE_EMPLOYEE"; employeeId: string } & PolicyJobContext)
  | ({ type: "RECONCILE_POLICY"; policyId: string; policyVersion: number } & PolicyJobContext)
  | ({ type: "RECONCILE_CATEGORY"; categoryId: string } & PolicyJobContext)
  | ({ type: "RECONCILE_BUSINESS" } & PolicyJobContext)
  | ({ type: "NIGHTLY_RECONCILIATION" } & Omit<PolicyJobContext, "businessId">);
