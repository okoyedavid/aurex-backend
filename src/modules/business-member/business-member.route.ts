import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { businessMemberController } from "./business-member.module.js";
import {
  getBusinessMemberSchema,
  listBusinessMemberSchema,
} from "./business-member.validators.js";

const businessMemberRouter = Router({ mergeParams: true });

businessMemberRouter.get(
  "/",
  protect,
  validate(listBusinessMemberSchema),
  requireBusinessPermission("members:view"),
  businessMemberController.listBusinessMembers,
);

businessMemberRouter.get(
  "/:memberId",
  protect,
  validate(getBusinessMemberSchema),
  requireBusinessPermission("members:view"),
  businessMemberController.getBusinessMember,
);

export { businessMemberRouter };
