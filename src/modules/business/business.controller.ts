import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { BusinessService } from "./business.service.js";
import {
  createBusinessSchema,
  getBusinessSchema,
} from "./business.validators.js";

export type BusinessControllerDependencies = {
  createApiError: (statusCode: number, message: string) => ApiError;
  businessService: BusinessService;
};

export const createBusinessController = ({
  createApiError,
  businessService,
}: BusinessControllerDependencies) => {
  const requireUser = (req: Express.Request) => {
    if (!req.user?.id) {
      throw createApiError(401, "Authentication required");
    }

    return req.user;
  };
  const createBusiness = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);

    const { name, industry, profile_img } =
      createBusinessSchema.shape.body.parse(req.validatedBody);

    const { business } = await businessService.createNewBusiness({
      name,
      ownerUserId: userContext.id,
      industry,
      profile_img,
    });

    return res.status(201).json({
      data: business,
      message: "Business Created Successfully",
      success: true,
    });
  });

  const listBusinesses = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { ownerOnly } = req.validatedQuery as { ownerOnly?: boolean };
    const { businesses } = await businessService.listBusinesses({
      ownerOnly,
      userId: userContext.id,
    });

    return res.status(200).json({
      data: businesses,
      message: "Businesses retrieved successfully",
      success: true,
    });
  });

  const getBusiness = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { businessId } = getBusinessSchema.shape.params.parse(
      req.validatedParams,
    );
    const { business } = await businessService.getBusiness({
      userId: userContext.id,
      businessId,
    });

    return res.status(200).json({
      data: business,
      message: "Business retrieved successfully",
      success: true,
    });
  });

  const updateProfileImage = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { profile_img, businessId } = req.validatedBody as {
      profile_img: string;
      businessId: string;
    };
    const business = await businessService.updateProfileImage({
      userId: userContext.id,
      businessId,
      profile_img,
    });

    return res.status(200).json({
      message: "Business profile Image updated successfully",
      data: business,
    });
  });

  const deleteProfileImage = asyncHandler(async (req, res) => {
    const userContext = requireUser(req);
    const { businessId } = req.validatedBody as {
      businessId: string;
    };
    const business = await businessService.deleteProfileImage({
      userId: userContext.id,
      businessId,
    });

    return res.status(200).json({
      message: "Business profile image deleted successfully",
      data: business,
    });
  });

  //   const inviteTeamMember = asyncHandler((req, res) => {});

  //   const assignRole = asyncHandler((req, res) => {});

  //   const deleteBusiness = asyncHandler((req, res) => {});

  //   const archiveTeamMember = asyncHandler((req, res) => {});

  //   const createEmployeeList = asyncHandler((req, res) => {});

  //   const createEmployee = asyncHandler((req, res) => {});

  return {
    createBusiness,
    getBusiness,
    listBusinesses,
    updateProfileImage,
    deleteProfileImage,
    // inviteTeamMember,
    // assignRole,
    // deleteBusiness,
    // archiveTeamMember,
    // createEmployee,
    // createEmployeeList,
  };
};
