import type { WithTransaction } from "../../utils/mongooose-transactions.js";
import type { HttpError } from "../../utils/api-error.js";
import type { PolicyAuditActor, PolicyAuditService } from "../policy-audit/policy-audit.service.js";
import type { EmployeeRepository } from "../employee/employee.repository.js";
import type { PolicyRepository } from "./policy.repository.js";
import type { PolicyResolver } from "./policy-resolver.service.js";

export type PolicyReconciliationDependencies = {
  repository: PolicyRepository;
  employeeRepository: EmployeeRepository;
  resolver: PolicyResolver;
  auditService: PolicyAuditService;
  withTransaction: WithTransaction;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export type ReconcileEmployeePoliciesInput = {
  businessId: string;
  employeeId: string;
  asOfDate: Date;
  reason: string;
  actor: PolicyAuditActor;
  correlationId?: string;
  triggeredByUserId?: string;
};

export type CreateManualAssignmentInput = {
  businessId: string;
  employeeId: string;
  policyId: string;
  userId: string;
  businessMemberId: string;
  effectiveFrom: Date;
};

export type EndManualAssignmentInput = {
  businessId: string;
  employeeId: string;
  policyId: string;
  userId: string;
  businessMemberId: string;
  effectiveTo: Date;
};

