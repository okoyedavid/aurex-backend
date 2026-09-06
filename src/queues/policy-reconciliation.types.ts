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
  | ({ type: "RECONCILE_EXTERNAL_EMPLOYEE"; employeeId: string } & PolicyJobContext)
  | ({ type: "ENFORCE_EXTERNAL_ACCESS"; grantId: string; desiredRevision: number } & PolicyJobContext)
  | ({ type: "RECONCILE_EXTERNAL_DRIFT" } & PolicyJobContext)
  | ({ type: "NIGHTLY_RECONCILIATION" } & Omit<PolicyJobContext, "businessId">);
