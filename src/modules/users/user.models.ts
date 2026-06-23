import mongoose, { HydratedDocument, model, Types } from "mongoose";

type UserJsonTransform = {
  _id?: Types.ObjectId;
  id?: string;
  password?: string;
  __v?: number;
  [key: string]: unknown;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    avatar: {
      type: String,
      required: false,
    },
    bio: {
      type: String,
      required: false,
    },
    username: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
      required: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    password: {
      type: String,
      required: false,
      minlength: 8,
      select: false,
    },
    preferences: {
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        const obj = ret as UserJsonTransform;

        obj.id = obj._id?.toString();
        delete obj._id;
        delete obj.password;
        delete obj.__v;
        return obj;
      },
    },
  },
);

userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string" },
    },
  },
);

export type UserSchemaType = {
  name: string;
  avatar?: string | null;
  bio?: string | null;
  username?: string | null;
  email: string;
  emailVerifiedAt: Date | null;
  status: "active" | "inactive";
  password?: string;
  preferences: {
    twoFactorEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type UserDocument = HydratedDocument<UserSchemaType>;

export const User = model<UserSchemaType>("User", userSchema);
