import { Router } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { businessController } from "./business.module.js";
import {
  createBusinessSchema,
  deleteProfileImgSchema,
  getBusinessSchema,
  listBusinessesSchema,
  updateProfileImgSchema,
} from "./business.validators.js";

const businessRouter = Router();

businessRouter.post(
  "/",
  protect,
  validate(createBusinessSchema),
  businessController.createBusiness,
);

businessRouter.get(
  "/",
  protect,
  validate(listBusinessesSchema),
  businessController.listBusinesses,
);

businessRouter.get(
  "/:businessId",
  protect,
  validate(getBusinessSchema),
  businessController.getBusiness,
);

businessRouter.patch(
  "/profile-image",
  protect,
  validate(updateProfileImgSchema),
  businessController.updateProfileImage,
);

businessRouter.delete(
  "/profile-image",
  protect,
  validate(deleteProfileImgSchema),
  businessController.deleteProfileImage,
);

export { businessRouter };
