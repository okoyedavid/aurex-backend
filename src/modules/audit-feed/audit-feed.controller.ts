import { asyncHandler } from "../../utils/async-handler.js";
import type { AuditFeedService } from "./audit-feed.service.js";
import { listBusinessAuditSchema, listPersonalAuditSchema } from "./audit-feed.validators.js";

export const createAuditFeedController = (service: AuditFeedService) => ({
  listBusinessAudit: asyncHandler(async (req, res) => {
    const { businessId } = listBusinessAuditSchema.shape.params.parse(req.validatedParams);
    const query = listBusinessAuditSchema.shape.query.parse(req.validatedQuery);
    const data = await service.listBusinessAudit({ businessId, userId: req.user!.id, ...query });
    return res.status(200).json({ success: true, message: "Business audit retrieved", data });
  }),
  listPersonalAudit: asyncHandler(async (req, res) => {
    const { businessId } = listPersonalAuditSchema.shape.params.parse(req.validatedParams);
    const query = listPersonalAuditSchema.shape.query.parse(req.validatedQuery);
    const data = await service.listPersonalAudit({ businessId, userId: req.user!.id, ...query });
    return res.status(200).json({ success: true, message: "Personal audit retrieved", data });
  }),
});
