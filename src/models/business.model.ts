import mongoose, { InferSchemaType, model } from "mongoose";

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    industry: {
      type: String,
      required: true,
      trim: true,
    },

    defaultCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "NGN",
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

businessSchema.index({ ownerUserId: 1, createdAt: -1 });

export type BusinessDocument = InferSchemaType<typeof businessSchema>;

export const Business = model<BusinessDocument>("Business", businessSchema);
