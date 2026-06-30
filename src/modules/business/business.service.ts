import { WithTransaction } from "../../utils/mongooose-transactions.js";
import { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import { RoleRepository } from "../role/role.repository.js";
import { BusinessRepository } from "./business.repository.js";
import {
  CreateBusinessInput,
  CreateBusinessPayload,
} from "./business.types.js";
import { CloudinaryService } from "../../services/cloudinary.service.js";
import { HttpError } from "../../utils/api-error.js";
import type { EmployeeListService } from "../employee-list/employee-list.service.js";

const serializeMembershipBusiness = (membership: {
  id: string;
  status: "active" | "suspended" | "removed";
  businessId: unknown;
  roleId: unknown;
}) => {
  const business =
    membership.businessId &&
    typeof membership.businessId === "object" &&
    "toJSON" in membership.businessId &&
    typeof membership.businessId.toJSON === "function"
      ? membership.businessId.toJSON()
      : null;
  const role =
    membership.roleId &&
    typeof membership.roleId === "object" &&
    "toJSON" in membership.roleId &&
    typeof membership.roleId.toJSON === "function"
      ? membership.roleId.toJSON()
      : null;

  if (!business) {
    return null;
  }

  return {
    business,
    membership: {
      id: membership.id,
      status: membership.status,
      role,
    },
  };
};

export type CreateBusinessDependencies = {
  businessRepository: BusinessRepository;
  roleRepository: RoleRepository;
  businessMemberRepository: BusinessMemberRepository;
  withTransaction: WithTransaction;
  cloudinaryService: CloudinaryService;
  createHttpError: (message: string, statusCode: number) => HttpError;
  employeeListService: EmployeeListService;
};

const createBusinessService = ({
  businessRepository,
  roleRepository,
  businessMemberRepository,
  createHttpError,
  withTransaction,
  cloudinaryService,
  employeeListService,
}: CreateBusinessDependencies) => {
  const deleteCloudinaryImageSafely = async (
    imageUrl: string | null | undefined,
  ) => {
    try {
      await cloudinaryService.deleteImageByUrl(imageUrl);
    } catch (error) {
      console.error("Failed to delete Cloudinary image", error);
    }
  };
  const createNewBusiness = async ({
    name,
    profile_img,
    ownerUserId,
    industry,
    employeeLists = [],
  }: CreateBusinessInput) => {
    const createData: CreateBusinessPayload = { name, ownerUserId, industry };

    if (profile_img !== undefined) {
      createData.profile_img = profile_img;
    }

    return withTransaction(async (mongoSession) => {
      const business = await businessRepository.createBusiness(createData, {
        session: mongoSession,
      });
      const ownerRole = await roleRepository.findSystemRoleByKey("owner");

      if (!ownerRole) {
        throw createHttpError(
          "System roles are not seeded. Run the system-role seed first",
          500,
        );
      }

      await businessMemberRepository.createBusinessMember(
        {
          businessId: business.id,
          userId: ownerUserId,
          roleId: ownerRole.id,
          invitedByUserId: null,
        },
        { session: mongoSession },
      );

      for (const employeeListInput of employeeLists) {
        await employeeListService.createEmployeeList(
          {
            ...employeeListInput,
            businessId: business.id,
            createdByUserId: ownerUserId,
          },
          { session: mongoSession },
        );
      }

      return { business };
    });
  };

  const listBusinesses = async ({
    ownerOnly = false,
    userId,
  }: {
    ownerOnly?: boolean;
    userId: string;
  }) => {
    if (ownerOnly) {
      const businesses =
        await businessRepository.findBusinessesByOwnerId(userId);

      return {
        businesses: businesses.map((business) => ({
          business,
          membership: null,
        })),
      };
    }

    const memberships =
      await businessMemberRepository.findActiveMembershipsByUserId(userId);
    const businesses = memberships
      .map(serializeMembershipBusiness)
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return { businesses };
  };

  const getBusiness = async ({
    userId,
    businessId,
  }: {
    userId: string;
    businessId: string;
  }) => {
    const membership =
      await businessMemberRepository.findActiveMembershipByBusinessAndUser(
        businessId,
        userId,
      );
    const membershipBusiness = membership
      ? serializeMembershipBusiness(membership)
      : null;

    if (!membershipBusiness) {
      throw createHttpError("Business not found", 404);
    }

    return { business: membershipBusiness };
  };

  const updateProfileImage = async ({
    userId,
    businessId,
    profile_img,
  }: {
    userId: string;
    businessId: string;
    profile_img: string;
  }) => {
    const previousBusiness =
      await businessRepository.findBusinessById(businessId);

    if (!previousBusiness) {
      throw createHttpError("Business not found", 404);
    }

    if (String(previousBusiness.ownerUserId) !== userId) {
      throw createHttpError("Not authorized to perform this action", 401);
    }

    const previousProfileImage =
      typeof previousBusiness.profile_img === "string"
        ? previousBusiness.profile_img
        : null;

    const updatedBusiness = await businessRepository.updateBusinessById(
      businessId,
      {
        profile_img,
      },
    );

    if (!updatedBusiness) {
      throw createHttpError("business not found", 404);
    }

    if (previousProfileImage && previousProfileImage !== profile_img) {
      await deleteCloudinaryImageSafely(previousProfileImage);
    }

    return updatedBusiness;
  };

  const deleteProfileImage = async ({
    userId,
    businessId,
  }: {
    userId: string;
    businessId: string;
  }) => {
    const previousBusiness =
      await businessRepository.findBusinessById(businessId);

    if (!previousBusiness) {
      throw createHttpError("Business not found", 404);
    }

    if (String(previousBusiness.ownerUserId) !== userId) {
      throw createHttpError("Not authorized to perform this action", 401);
    }

    const previousProfileImage =
      typeof previousBusiness.profile_img === "string"
        ? previousBusiness.profile_img
        : null;

    const updatedBusiness = await businessRepository.updateBusinessById(
      businessId,
      {
        profile_img: null,
      },
    );

    if (!updatedBusiness) {
      throw createHttpError("business not found", 404);
    }

    await deleteCloudinaryImageSafely(previousProfileImage);

    return updatedBusiness;
  };

  return {
    createNewBusiness,
    deleteProfileImage,
    getBusiness,
    listBusinesses,
    updateProfileImage,
  };
};

export { createBusinessService };

export type BusinessService = ReturnType<typeof createBusinessService>;
