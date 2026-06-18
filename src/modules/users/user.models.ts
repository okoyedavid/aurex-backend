import mongoose, {
  HydratedDocument,
  InferSchemaType,
  model,
  Types,
} from "mongoose";

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
      unique: true,
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

export type UserSchemaType = InferSchemaType<typeof userSchema>;

export type UserDocument = HydratedDocument<
  UserSchemaType & {
    _id: Types.ObjectId;
  }
>;

export const User = model<UserDocument>("User", userSchema);
