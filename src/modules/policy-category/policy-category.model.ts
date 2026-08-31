import mongoose, { type InferSchemaType } from "mongoose";

export type PolicyCardinality = "ONE" | "MANY";
export type PolicyCategoryStatus = "active" | "archived";

const policyCategorySchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
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
    cardinality: {
      type: String,
      enum: ["ONE", "MANY"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      required: true,
      index: true,
    },
    createdBy: {
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

policyCategorySchema.set("toJSON", {
  transform: (_doc, ret) => {
    const category = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (category._id) {
      category.id = category._id.toString();
    }

    delete category._id;
    return ret;
  },
});

policyCategorySchema.index(
  { businessId: 1, name: 1 },
  { unique: true },
);
policyCategorySchema.index({ businessId: 1, status: 1, createdAt: -1 });

export type PolicyCategoryDocument = InferSchemaType<
  typeof policyCategorySchema
>;

export const PolicyCategory = mongoose.model<PolicyCategoryDocument>(
  "PolicyCategory",
  policyCategorySchema,
);
