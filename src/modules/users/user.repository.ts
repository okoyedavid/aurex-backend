import { QueryOptions } from "mongoose";
import { User, type UserSchemaType } from "./user.models.js";
import { CreateUserPayload, UserWithPasswordDocument } from "./user.types.js";

const findUserById = (userId: string) => User.findById(userId);

const findUserByIdWithPassword = (userId: string) =>
  User.findById(userId).select("+password");

const findUserByEmail = (email: string) => User.findOne({ email });

const findUserByUsername = (username: string) => User.findOne({ username });

const createUser = (payload: CreateUserPayload) => User.create(payload);

const deleteUserById = (userId: string) => User.findByIdAndDelete(userId);

const updateUserById = (
  userId: string,
  payload: Partial<UserSchemaType>,
  options: QueryOptions = {},
) =>
  User.findByIdAndUpdate(userId, payload, {
    new: true,
    ...options,
  });

const findUserByEmailWithPassword = async (
  email: string,
): Promise<UserWithPasswordDocument | null> => {
  return User.findOne({ email: email.trim().toLowerCase() })
    .select("+password")
    .exec() as Promise<UserWithPasswordDocument | null>;
};

export const userRepository = {
  findUserByUsername,
  createUser,
  deleteUserById,
  findUserByEmail,
  findUserById,
  updateUserById,
  findUserByIdWithPassword,
  findUserByEmailWithPassword,
};

export type UserRepository = typeof userRepository;
