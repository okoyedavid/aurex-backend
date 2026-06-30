import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { businessMemberController } from "./business-member.module.js";
import {
  getBusinessMemberSchema,
  listBusinessMemberSchema,
  removeBusinessMemberSchema,
  updateBusinessMemberRoleSchema,
  updateBusinessMemberStatusSchema,
} from "./business-member.validators.js";

const businessMemberRouter = Router({ mergeParams: true });

businessMemberRouter.get(
  "/",
  protect,
  validate(listBusinessMemberSchema),
  requireBusinessPermission("members:view"),
  businessMemberController.listBusinessMembers,
);

businessMemberRouter.patch(
  "/:memberId/role",
  protect,
  validate(updateBusinessMemberRoleSchema),
  requireBusinessPermission("members:update_role"),
  requireBusinessPermission("roles:assign"),
  businessMemberController.updateBusinessMemberRole,
);

businessMemberRouter.patch(
  "/:memberId/status",
  protect,
  validate(updateBusinessMemberStatusSchema),
  requireBusinessPermission("members:update_status"),
  businessMemberController.updateBusinessMemberStatus,
);

businessMemberRouter.delete(
  "/:memberId",
  protect,
  validate(removeBusinessMemberSchema),
  requireBusinessPermission("members:remove"),
  businessMemberController.removeBusinessMember,
);

businessMemberRouter.get(
  "/:memberId",
  protect,
  validate(getBusinessMemberSchema),
  requireBusinessPermission("members:view"),
  businessMemberController.getBusinessMember,
);

export { businessMemberRouter };
