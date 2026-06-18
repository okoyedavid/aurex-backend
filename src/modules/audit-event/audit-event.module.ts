import { hashService } from "../../utils/hash.js";
import { notificationService } from "../notification/notification.module.js";
import { auditEventRepository } from "./audit-event.repository.js";
import { createAuditEventService } from "./audit-event.service.js";

export const auditEventService = createAuditEventService({
  hashService,
  notificationService,
  auditEventRepository,
});
