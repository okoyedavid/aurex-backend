import { createHttpError } from "../../utils/api-error.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";
import { roleRepository } from "../role/role.repository.js";
import { userRepository } from "../users/user.repository.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { createBusinessInviteController } from "./business-invite.controller.js";
import { businessInviteRepository } from "./business-invite.repository.js";
import { createBusinessInviteService } from "./business-invite.service.js";

const businessInviteService = createBusinessInviteService({
  businessInviteRepository,
  businessMemberRepository,
  roleRepository,
  userRepository,
  auditEventService,
  withTransaction,
  createHttpError,
});

const businessInviteController = createBusinessInviteController({
  businessInviteService,
});

export { businessInviteController, businessInviteService };
