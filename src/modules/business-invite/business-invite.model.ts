import mongoose, { model, type InferSchemaType } from "mongoose";

const businessInviteSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },

    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    acceptedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "revoked", "expired"],
      default: "pending",
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    approvalStatus: {
      type: String,
      enum: ["not_required", "pending", "approved", "rejected"],
      default: "not_required",
      required: true,
      index: true,
    },

    approvedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalRejectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvalRejectedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    emailDeliveryStatus: {
      type: String,
      enum: ["pending", "retrying", "sent", "failed"],
      default: "pending",
      required: true,
      index: true,
    },

    emailDeliveryAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastEmailAttemptAt: {
      type: Date,
      default: null,
    },

    emailDeliveredAt: {
      type: Date,
      default: null,
    },

    emailFailureReason: {
      type: String,
      default: null,
      trim: true,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

businessInviteSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const invite = ret as {
      _id?: { toString: () => string };
      id?: string;
      tokenHash?: string | null;
    };

    if (invite._id) {
      invite.id = invite._id.toString();
    }

    delete invite._id;
    delete invite.tokenHash;
    return ret;
  },
});

businessInviteSchema.index({ businessId: 1, email: 1, status: 1 });
businessInviteSchema.index({ businessId: 1, createdAt: -1 });
businessInviteSchema.index({ email: 1, status: 1 });
businessInviteSchema.index({ expiresAt: 1, status: 1 });
businessInviteSchema.index({ businessId: 1, approvalStatus: 1, createdAt: -1 });
businessInviteSchema.index(
  { businessId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
);

export type BusinessInviteDocument = InferSchemaType<
  typeof businessInviteSchema
>;

export const BusinessInvite = model<BusinessInviteDocument>(
  "BusinessInvite",
  businessInviteSchema,
);
