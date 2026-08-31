import mongoose, { type InferSchemaType } from "mongoose";

export type PolicyAssignmentSource = "rule" | "manual";
export type EmployeePolicyAssignmentStatus = "active" | "ended";

const employeePolicyAssignmentSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Policy",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyCategory",
      required: true,
      index: true,
    },
    policyVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    source: {
      type: String,
      enum: ["rule", "manual"],
      required: true,
      index: true,
    },
    winningRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyRule",
      default: null,
      index: true,
    },
    matchedRuleIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PolicyRule",
      },
    ],
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      required: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },
    resolvedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

employeePolicyAssignmentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const assignment = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (assignment._id) {
      assignment.id = assignment._id.toString();
    }

    delete assignment._id;
    return ret;
  },
});

employeePolicyAssignmentSchema.index(
  { businessId: 1, employeeId: 1, policyId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);
employeePolicyAssignmentSchema.index({
  businessId: 1,
  employeeId: 1,
  status: 1,
  effectiveFrom: -1,
});
employeePolicyAssignmentSchema.index({
  businessId: 1,
  policyId: 1,
  status: 1,
});
employeePolicyAssignmentSchema.index({
  businessId: 1,
  categoryId: 1,
  status: 1,
});
employeePolicyAssignmentSchema.index({
  businessId: 1,
  winningRuleId: 1,
  status: 1,
});

export type EmployeePolicyAssignmentDocument = InferSchemaType<
  typeof employeePolicyAssignmentSchema
>;

export const EmployeePolicyAssignment =
  mongoose.model<EmployeePolicyAssignmentDocument>(
    "EmployeePolicyAssignment",
    employeePolicyAssignmentSchema,
  );
