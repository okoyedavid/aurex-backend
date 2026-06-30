import { QueryOptions } from "mongoose";
import { Business, type BusinessDocument } from "./business.model.js";
import { CreateBusinessPayload } from "./business.types.js";
import { RepositoryOptions } from "../../types/repository-types.js";

const findBusinessById = (id: string) => Business.findById(id);

const findBusinessesByOwnerId = (ownerUserId: string) =>
  Business.find({ ownerUserId });

const createBusiness = (
  payload: CreateBusinessPayload,
  options: RepositoryOptions = {},
) =>
  Business.create([payload], options).then(([business]) => {
    if (!business) {
      throw new Error("Failed to create business");
    }

    return business;
  });

const updateBusinessById = (
  businessId: string,
  payload: Partial<BusinessDocument>,
  options: QueryOptions = {},
) =>
  Business.findByIdAndUpdate(businessId, payload, {
    new: true,
    ...options,
  });

export const businessRepository = {
  updateBusinessById,
  createBusiness,
  findBusinessById,
  findBusinessesByOwnerId,
};

export type BusinessRepository = typeof businessRepository;
