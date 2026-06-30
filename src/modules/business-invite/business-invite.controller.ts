import { asyncHandler } from "../../utils/async-handler.js";
import type { BusinessInviteService } from "./business-invite.service.js";
import {
  createBusinessInviteSchema,
  listPendingInviteApprovalsSchema,
  listSentBusinessInvitesSchema,
  respondToInviteApprovalSchema,
  respondToBusinessInviteSchema,
  viewBusinessInvitesSchema,
} from "./business-invite.validators.js";

type CreateBusinessInviteControllerDependencies = {
  businessInviteService: BusinessInviteService;
};

export const createBusinessInviteController = ({
  businessInviteService,
}: CreateBusinessInviteControllerDependencies) => {
  const createBusinessInvite = asyncHandler(async (req, res) => {
    const { businessId } = createBusinessInviteSchema.shape.params.parse(
      req.validatedParams,
    );
    const { email, roleId } = createBusinessInviteSchema.shape.body.parse(
      req.validatedBody,
    );

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessInvite } =
      await businessInviteService.createBusinessInvite({
        businessId,
        invitedByUserId: req.user.id,
        email,
        roleId,
      });

    return res.status(201).json({
      data: businessInvite,
      message: "Business invitation created",
      success: true,
    });
  });

  const listSentBusinessInvites = asyncHandler(async (req, res) => {
    const { businessId } = listSentBusinessInvitesSchema.shape.params.parse(
      req.validatedParams,
    );
    const query = listSentBusinessInvitesSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await businessInviteService.listSentBusinessInvites({
      businessId,
      ...query,
    });

    return res.status(200).json({
      data: result,
      message: "Sent business invitations retrieved",
      success: true,
    });
  });

  const viewBusinessInvites = asyncHandler(async (req, res) => {
    if (!req.user?.email) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const query = viewBusinessInvitesSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await businessInviteService.viewBusinessInvites({
      email: req.user.email,
      ...query,
    });

    return res.status(200).json({
      data: result,
      message: "Business invitations retrieved",
      success: true,
    });
  });

  const acceptBusinessInvite = asyncHandler(async (req, res) => {
    const { inviteId } = respondToBusinessInviteSchema.shape.params.parse(
      req.validatedParams,
    );

    if (!req.user?.id || !req.user.email) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessInvite, membershipCreated } =
      await businessInviteService.acceptBusinessInvite({
        inviteId,
        userId: req.user.id,
        email: req.user.email,
      });

    return res.status(200).json({
      data: businessInvite,
      meta: { membershipCreated },
      message: "Business invitation accepted",
      success: true,
    });
  });

  const listPendingInviteApprovals = asyncHandler(async (req, res) => {
    const { businessId } =
      listPendingInviteApprovalsSchema.shape.params.parse(req.validatedParams);
    const query = listPendingInviteApprovalsSchema.shape.query.parse(
      req.validatedQuery,
    );
    const result = await businessInviteService.listPendingInviteApprovals({
      businessId,
      ...query,
    });

    return res.status(200).json({
      data: result,
      message: "Pending invite approvals retrieved",
      success: true,
    });
  });

  const approveBusinessInvite = asyncHandler(async (req, res) => {
    const { businessId, inviteId } =
      respondToInviteApprovalSchema.shape.params.parse(req.validatedParams);

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessInvite } =
      await businessInviteService.approveBusinessInvite({
        businessId,
        inviteId,
        approvedByUserId: req.user.id,
      });

    return res.status(200).json({
      data: businessInvite,
      message: "Business invitation role approved",
      success: true,
    });
  });

  const rejectBusinessInviteApproval = asyncHandler(async (req, res) => {
    const { businessId, inviteId } =
      respondToInviteApprovalSchema.shape.params.parse(req.validatedParams);

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessInvite } =
      await businessInviteService.rejectBusinessInviteApproval({
        businessId,
        inviteId,
        rejectedByUserId: req.user.id,
      });

    return res.status(200).json({
      data: businessInvite,
      message: "Business invitation role approval rejected",
      success: true,
    });
  });

  const rejectBusinessInvite = asyncHandler(async (req, res) => {
    const { inviteId } = respondToBusinessInviteSchema.shape.params.parse(
      req.validatedParams,
    );

    if (!req.user?.id || !req.user.email) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessInvite } =
      await businessInviteService.rejectBusinessInvite({
        inviteId,
        userId: req.user.id,
        email: req.user.email,
      });

    return res.status(200).json({
      data: businessInvite,
      message: "Business invitation rejected",
      success: true,
    });
  });

  return {
    acceptBusinessInvite,
    approveBusinessInvite,
    createBusinessInvite,
    listPendingInviteApprovals,
    listSentBusinessInvites,
    rejectBusinessInvite,
    rejectBusinessInviteApproval,
    viewBusinessInvites,
  };
};
