import mongoose, { InferSchemaType } from "mongoose";

const employeeGroupSchema = new mongoose.Schema(
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
    sourceTemplateKey: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

employeeGroupSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const employeeGroup = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (employeeGroup._id) {
      employeeGroup.id = employeeGroup._id.toString();
    }

    delete employeeGroup._id;
    return ret;
  },
});

employeeGroupSchema.index({ businessId: 1, name: 1 }, { unique: true });
employeeGroupSchema.index(
  { businessId: 1, sourceTemplateKey: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceTemplateKey: { $type: "string" } },
  },
);

export type EmployeeGroupDocument = InferSchemaType<
  typeof employeeGroupSchema
>;

export const EmployeeGroup = mongoose.model<EmployeeGroupDocument>(
  "EmployeeGroup",
  employeeGroupSchema,
);
