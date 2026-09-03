import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { auditFeedController } from "./audit-feed.module.js";
import { listBusinessAuditSchema, listPersonalAuditSchema } from "./audit-feed.validators.js";

const router = Router({ mergeParams: true });

router.get(
  "/me",
  protect,
  validate(listPersonalAuditSchema),
  auditFeedController.listPersonalAudit,
);
router.get(
  "/",
  protect,
  validate(listBusinessAuditSchema),
  requireBusinessPermission("audit_logs:view"),
  auditFeedController.listBusinessAudit,
);

export { router as auditFeedRouter };
