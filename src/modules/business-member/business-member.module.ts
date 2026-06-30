import { createHttpError } from "../../utils/api-error.js";
import { businessMemberRepository } from "./business-member.repository.js";
import { createBusinessMemberController } from "./business-member.controller.js";
import { createBusinessMemberService } from "./business-member.service.js";
import { roleRepository } from "../role/role.repository.js";
import { auditEventService } from "../audit-event/audit-event.module.js";

const businessMemberService = createBusinessMemberService({
  businessMemberRepository,
  roleRepository,
  auditEventService,
  createHttpError,
});

const businessMemberController = createBusinessMemberController({
  businessMemberService,
});

export { businessMemberController, businessMemberService };
