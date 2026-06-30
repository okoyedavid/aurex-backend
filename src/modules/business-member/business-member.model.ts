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

    roleUpdatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    roleUpdatedAt: {
      type: Date,
      default: null,
    },

    statusUpdatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    statusUpdatedAt: {
      type: Date,
      default: null,
    },

    removedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    removedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

businessMemberSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const member = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (member._id) {
      member.id = member._id.toString();
    }

    delete member._id;
    return ret;
  },
});

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
