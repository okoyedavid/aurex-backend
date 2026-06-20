import mongoose, { InferSchemaType, Types } from "mongoose";

type SessionJsonTransform = {
  _id?: Types.ObjectId;
  id?: string;
  __v?: number;
  [key: string]: unknown;
};

const verificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: ["verify_email", "reset_password", "change_email"],
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    targetEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    usedAt: {
      type: Date,
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

verificationSchema.index({ userId: 1, purpose: 1 });
verificationSchema.index({ tokenHash: 1 }, { unique: true });

export type VerificationDocument = InferSchemaType<typeof verificationSchema>;

const VerificationToken = mongoose.model<VerificationDocument>(
  "VerificationToken",
  verificationSchema,
);

export { VerificationToken };
