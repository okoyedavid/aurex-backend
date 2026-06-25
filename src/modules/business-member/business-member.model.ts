import mongoose, { InferSchemaType, model } from "mongoose";

const businessMemberSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: ["active", "suspended", "removed"],
      default: "active",
      index: true,
    },

    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

businessMemberSchema.index({ businessId: 1, userId: 1 }, { unique: true });
businessMemberSchema.index({ userId: 1, status: 1 });
businessMemberSchema.index({ businessId: 1, status: 1 });

export type BusinessMemberDocument = InferSchemaType<
  typeof businessMemberSchema
>;

export const BusinessMember = model<BusinessMemberDocument>(
  "BusinessMember",
  businessMemberSchema,
);
