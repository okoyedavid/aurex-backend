import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { businessInviteController } from "./business-invite.module.js";
import {
  createBusinessInviteSchema,
  listPendingInviteApprovalsSchema,
  listSentBusinessInvitesSchema,
  respondToInviteApprovalSchema,
  respondToBusinessInviteSchema,
  viewBusinessInvitesSchema,
} from "./business-invite.validators.js";

const businessInviteRouter = Router({ mergeParams: true });

businessInviteRouter.get(
  "/pending-approval",
  protect,
  validate(listPendingInviteApprovalsSchema),
  requireBusinessPermission("roles:assign"),
  businessInviteController.listPendingInviteApprovals,
);

businessInviteRouter.post(
  "/:inviteId/approve",
  protect,
  validate(respondToInviteApprovalSchema),
  requireBusinessPermission("roles:assign"),
  businessInviteController.approveBusinessInvite,
);

businessInviteRouter.post(
  "/:inviteId/reject-approval",
  protect,
  validate(respondToInviteApprovalSchema),
  requireBusinessPermission("roles:assign"),
  businessInviteController.rejectBusinessInviteApproval,
);

businessInviteRouter.get(
  "/",
  protect,
  validate(listSentBusinessInvitesSchema),
  requireBusinessPermission("members:invite"),
  businessInviteController.listSentBusinessInvites,
);

businessInviteRouter.post(
  "/",
  protect,
  validate(createBusinessInviteSchema),
  requireBusinessPermission("members:invite"),
  businessInviteController.createBusinessInvite,
);

const userBusinessInviteRouter = Router();

userBusinessInviteRouter.get(
  "/",
  protect,
  validate(viewBusinessInvitesSchema),
  businessInviteController.viewBusinessInvites,
);

userBusinessInviteRouter.post(
  "/:inviteId/accept",
  protect,
  validate(respondToBusinessInviteSchema),
  businessInviteController.acceptBusinessInvite,
);

userBusinessInviteRouter.post(
  "/:inviteId/reject",
  protect,
  validate(respondToBusinessInviteSchema),
  businessInviteController.rejectBusinessInvite,
);

export { businessInviteRouter, userBusinessInviteRouter };
