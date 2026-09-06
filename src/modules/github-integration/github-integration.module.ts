import {
  enqueueEmployeeExternalReconciliation,
  enqueuePolicyReconciliation,
} from "../../queues/policy-reconciliation.queue.js";
import { createHttpError } from "../../utils/api-error.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";
import { employeeRepository } from "../employee/employee.repository.js";
import { createExternalAccessReconciliationService } from "./external-access-reconciliation.service.js";
import { createGitHubClientFactory } from "./github-client.js";
import { createGitHubConnectionService } from "./github-connection.service.js";
import { createGitHubIntegrationController } from "./github-integration.controller.js";
import { githubIntegrationRepository } from "./github-integration.repository.js";

export { githubIntegrationRepository };
export const githubClientFactory = createGitHubClientFactory();
export const externalAccessReconciliationService =
  createExternalAccessReconciliationService({
    repository: githubIntegrationRepository,
    employeeRepository,
    clientFactory: githubClientFactory,
    auditService: auditEventService,
  });
export const githubConnectionService = createGitHubConnectionService({
  repository: githubIntegrationRepository,
  employeeRepository,
  businessMemberRepository,
  clientFactory: githubClientFactory,
  auditService: auditEventService,
  withTransaction,
  createHttpError,
  enqueueEmployeeExternalReconciliation,
  enqueueBusinessReconciliation: (businessId, reason, requestedBy) =>
    enqueuePolicyReconciliation({
      type: "RECONCILE_BUSINESS",
      businessId,
      reason,
      requestedBy,
      requestedAt: new Date().toISOString(),
    }),
});
export const githubIntegrationController = createGitHubIntegrationController({
  connectionService: githubConnectionService,
  externalAccessService: externalAccessReconciliationService,
});
