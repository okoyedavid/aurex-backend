import { createHttpError } from "../../utils/api-error.js";
import { auditEventRepository } from "../audit-event/audit-event.repository.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";
import { employeeRepository } from "../employee/employee.repository.js";
import { policyAuditRepository } from "../policy-audit/policy-audit.repository.js";
import { createAuditFeedController } from "./audit-feed.controller.js";
import { createAuditFeedService } from "./audit-feed.service.js";

export const auditFeedService = createAuditFeedService({
  auditEventRepository,
  policyAuditRepository,
  businessMemberRepository,
  employeeRepository,
  createHttpError,
});
export const auditFeedController = createAuditFeedController(auditFeedService);
