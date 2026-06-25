import { cloudinaryService } from "../../services/cloudinary.service.js";
import { ApiError, createHttpError } from "../../utils/api-error.js";
import { withTransaction } from "../../utils/mongooose-transactions.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";
import { roleRepository } from "../role/role.repository.js";
import { createBusinessController } from "./business.controller.js";
import { businessRepository } from "./business.repository.js";
import { createBusinessService } from "./business.service.js";

export const businessService = createBusinessService({
  businessRepository,
  roleRepository,
  businessMemberRepository,
  withTransaction,
  createHttpError,
  cloudinaryService,
});

export const businessController = createBusinessController({
  businessService,
  createApiError: (statusCode, message) => new ApiError(statusCode, message),
});
