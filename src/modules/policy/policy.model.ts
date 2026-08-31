import mongoose, { type InferSchemaType } from "mongoose";

export type PolicyStatus = "draft" | "active" | "archived";
export type PolicyConfiguration = Record<string, unknown>;

const policySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyCategory",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    configuration: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      required: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      default: null,
      index: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

policySchema.set("toJSON", {
  transform: (_doc, ret) => {
    const policy = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (policy._id) {
      policy.id = policy._id.toString();
    }

    delete policy._id;
    return ret;
  },
});

policySchema.index({ businessId: 1, categoryId: 1, status: 1 });
policySchema.index({ businessId: 1, name: 1, version: -1 });
policySchema.index({ businessId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 });

export type PolicyDocument = InferSchemaType<typeof policySchema>;

export const Policy = mongoose.model<PolicyDocument>("Policy", policySchema);
