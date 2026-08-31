import mongoose, { InferSchemaType } from "mongoose";

const employeeTypeSchema = new mongoose.Schema(
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

employeeTypeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const employeeType = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (employeeType._id) {
      employeeType.id = employeeType._id.toString();
    }

    delete employeeType._id;
    return ret;
  },
});

employeeTypeSchema.index({ businessId: 1, name: 1 }, { unique: true });
employeeTypeSchema.index(
  { businessId: 1, sourceTemplateKey: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceTemplateKey: { $type: "string" } },
  },
);

export type EmployeeTypeDocument = InferSchemaType<
  typeof employeeTypeSchema
>;

export const EmployeeType = mongoose.model<EmployeeTypeDocument>(
  "EmployeeType",
  employeeTypeSchema,
);
