import mongoose, { InferSchemaType, Types } from "mongoose";

export type SessionJsonTransform = {
  _id?: Types.ObjectId;
  id?: string;
  __v?: number;
  [key: string]: unknown;
};

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userSessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    currentAuthSessionId: {
      type: String,
      trim: true,
      default: null,
    },

    userAgent: {
      type: String,
      trim: true,
      default: null,
    },

    deviceName: {
      type: String,
      trim: true,
      default: null,
    },

    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },

    city: {
      type: String,
      trim: true,
      default: null,
    },

    region: {
      type: String,
      trim: true,
      default: null,
    },

    country: {
      type: String,
      trim: true,
      default: null,
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        const obj = ret as SessionJsonTransform;

        obj.id = obj._id?.toString();
        delete obj._id;
        delete obj.__v;
        return obj;
      },
    },
  },
);

userSessionSchema.index({ userId: 1, revokedAt: 1 });
userSessionSchema.index({ userId: 1, lastSeenAt: -1 });

export type UserSessionDocument = InferSchemaType<typeof userSessionSchema>;

export const UserSession = mongoose.model<UserSessionDocument>(
  "UserSession",
  userSessionSchema,
);
