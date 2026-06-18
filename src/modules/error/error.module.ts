import { auditEventService } from "../audit-event/audit-event.module.js";
import { userRepository } from "../users/user.repository.js";
import { createErrorService } from "./error.service.js";

export const errorService = createErrorService({
  userRepository,
  auditEventService,
});
