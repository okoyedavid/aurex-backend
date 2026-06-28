import { asyncHandler } from "../../utils/async-handler.js";
import { BusinessMemberService } from "./business-member.service.js";
import {
  getBusinessMemberSchema,
  listBusinessMemberSchema,
} from "./business-member.validators.js";

export type CreateBusinessMemberControllerDependencies = {
  businessMemberService: BusinessMemberService;
};

export const createBusinessMemberController = ({
  businessMemberService,
}: CreateBusinessMemberControllerDependencies) => {
  const listBusinessMembers = asyncHandler(async (req, res) => {
    const { businessId } = listBusinessMemberSchema.shape.params.parse(
      req.validatedParams,
    );

    const { page, limit } = listBusinessMemberSchema.shape.query.parse(
      req.validatedQuery,
    );

    const result = await businessMemberService.listBusinessMembers({
      businessId,
      page,
      limit,
    });

    return res.status(200).json({
      data: result,
      message: "Business Members retrieved successfully",
      success: true,
    });
  });

  const getBusinessMember = asyncHandler(async (req, res) => {
    const { businessId, memberId } = getBusinessMemberSchema.shape.params.parse(
      req.validatedParams,
    );

    const result = await businessMemberService.getBusinessMember({
      businessId,
      memberId,
    });

    return res.status(200).json({
      data: result.businessMember,
      message: "Business member retrieved successfully",
      success: true,
    });
  });

  return { getBusinessMember, listBusinessMembers };
};
