import type { HydratedDocument, Types } from "mongoose";
import type { UserSchemaType } from "./user.models.js";

export type CreateUserPayload = {
  email: string;
  name: string;
  password: string;
};

export type UserWithPasswordDocument = HydratedDocument<
  UserSchemaType & {
    password: string;
  }
>;

export type SafeUser = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  avatar: string | null;
  bio: string | null;
  emailVerifiedAt: Date | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserLike = {
  _id: Types.ObjectId;
  name?: string | null;
  username?: string | null;
  email: string;
  avatar?: string | null;
  bio?: string | null;
  emailVerifiedAt?: Date | null;
  status?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
