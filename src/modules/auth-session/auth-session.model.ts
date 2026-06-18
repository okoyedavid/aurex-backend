import mongoose, { InferSchemaType, Types } from "mongoose";

type SessionJsonTransform = {
  _id?: Types.ObjectId;
  id?: string;
  __v?: number;
  [key: string]: unknown;
};

const authSessionSchema = new mongoose.Schema(
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
      trim: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      trim: true,
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

    replacedBySessionId: {
      type: String,
      trim: true,
      default: null,
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

authSessionSchema.index({ userSessionId: 1, revokedAt: 1 });
authSessionSchema.index({ userId: 1, revokedAt: 1 });

export type AuthSessionDocument = InferSchemaType<typeof authSessionSchema>;

const AuthSession = mongoose.model<AuthSessionDocument>(
  "AuthSession",
  authSessionSchema,
);

export { AuthSession };
