import { BusinessMemberRepository } from "./business-member.repository.js";
import type { HttpError } from "../../utils/api-error.js";

type CreateBusinessMemberServiceDependencies = {
  businessMemberRepository: BusinessMemberRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

export const createBusinessMemberService = ({
  businessMemberRepository,
  createHttpError,
}: CreateBusinessMemberServiceDependencies) => {
  const listBusinessMembers = async ({
    businessId,
    page,
    limit,
  }: {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } =
      await businessMemberRepository.paginateBusinessMembersByBusinessId({
        businessId,
        page,
        limit,
      });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const getBusinessMember = async ({
    businessId,
    memberId,
  }: {
    businessId: string;
    memberId: string;
  }) => {
    const businessMember =
      await businessMemberRepository.findBusinessMemberByBusinessAndId(
        businessId,
        memberId,
      );

    if (!businessMember) {
      throw createHttpError("Business member not found", 404);
    }

    return { businessMember };
  };

  return { getBusinessMember, listBusinessMembers };
};

export type BusinessMemberService = ReturnType<
  typeof createBusinessMemberService
>;
