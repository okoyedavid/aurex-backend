import mongoose, { InferSchemaType, model } from "mongoose";

const employeeListSchema = new mongoose.Schema(
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
      minlength: 2,
      maxlength: 80,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "archived"],
      index: true,
    },
    description: { type: String, trim: true },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "NGN",
    },

    defaultPayFrequency: {
      type: String,
      trim: true,
      enum: ["weekly", "bi-weekly", "monthly", "one_time"],

      required: true,
      default: "monthly",
    },

    paymentStatus: {
      type: String,
      enum: ["payable", "blocked", "needs_review"],
      default: "needs_review",
      index: true,
    },

    paymentBlockedReason: { type: String, trim: true },

    validationStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "processing",
        "completed",
        "completed_with_errors",
      ],
      default: "not_started",
      index: true,
    },

    lastValidationAt: { type: Date },

    totalEmployeeCount: { type: Number, default: 0, min: 0 },
    pendingVerificationCount: { type: Number, default: 0, min: 0 },
    verifiedEmployeeCount: { type: Number, default: 0, min: 0 },
    invalidEmployeeCount: { type: Number, default: 0, min: 0 },
    verificationErrorCount: { type: Number, default: 0, min: 0 },

    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

employeeListSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const employeeList = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (employeeList._id) {
      employeeList.id = employeeList._id.toString();
    }

    delete employeeList._id;
    return ret;
  },
});

employeeListSchema.index({ businessId: 1, status: 1 });
employeeListSchema.index({ businessId: 1, paymentStatus: 1 });
employeeListSchema.index({ businessId: 1, validationStatus: 1 });
employeeListSchema.index({ businessId: 1, name: 1 }, { unique: true });

export type EmployeeListDocument = InferSchemaType<typeof employeeListSchema>;

export const EmployeeList = model<EmployeeListDocument>(
  "EmployeeList",
  employeeListSchema,
);
