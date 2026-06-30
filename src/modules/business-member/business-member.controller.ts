import { asyncHandler } from "../../utils/async-handler.js";
import { BusinessMemberService } from "./business-member.service.js";
import {
  getBusinessMemberSchema,
  listBusinessMemberSchema,
  removeBusinessMemberSchema,
  updateBusinessMemberRoleSchema,
  updateBusinessMemberStatusSchema,
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

  const updateBusinessMemberRole = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const params = updateBusinessMemberRoleSchema.shape.params.parse(
      req.validatedParams,
    );
    const { roleId } = updateBusinessMemberRoleSchema.shape.body.parse(
      req.validatedBody,
    );
    const { businessMember } =
      await businessMemberService.updateBusinessMemberRole({
        ...params,
        roleId,
        actorUserId: req.user.id,
      });

    return res.status(200).json({
      data: businessMember,
      message: "Business member role updated",
      success: true,
    });
  });

  const updateBusinessMemberStatus = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const params = updateBusinessMemberStatusSchema.shape.params.parse(
      req.validatedParams,
    );
    const { status } = updateBusinessMemberStatusSchema.shape.body.parse(
      req.validatedBody,
    );
    const { businessMember } =
      await businessMemberService.updateBusinessMemberStatus({
        ...params,
        status,
        actorUserId: req.user.id,
      });

    return res.status(200).json({
      data: businessMember,
      message: "Business member status updated",
      success: true,
    });
  });

  const removeBusinessMember = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const params = removeBusinessMemberSchema.shape.params.parse(
      req.validatedParams,
    );
    const { businessMember } =
      await businessMemberService.removeBusinessMember({
        ...params,
        actorUserId: req.user.id,
      });

    return res.status(200).json({
      data: businessMember,
      message: "Business member removed",
      success: true,
    });
  });

  return {
    getBusinessMember,
    listBusinessMembers,
    removeBusinessMember,
    updateBusinessMemberRole,
    updateBusinessMemberStatus,
  };
};
