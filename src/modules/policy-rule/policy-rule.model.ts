import mongoose, { type InferSchemaType, type Types } from "mongoose";

export type PolicyRuleField =
  | "department"
  | "state"
  | "tenure"
  | "employeeType"
  | "group";

export type PolicyRuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "gte"
  | "lte"
  | "gt"
  | "lt";

export type PolicyRuleConditionValue =
  | string
  | number
  | Types.ObjectId
  | Types.ObjectId[]
  | string[];

export interface PolicyRuleCondition {
  field: PolicyRuleField;
  operator: PolicyRuleOperator;
  value: PolicyRuleConditionValue;
}

export type PolicyRuleStatus = "active" | "disabled";

const policyRuleConditionSchema = new mongoose.Schema<PolicyRuleCondition>(
  {
    field: {
      type: String,
      enum: ["department", "state", "tenure", "employeeType", "group"],
      required: true,
    },
    operator: {
      type: String,
      enum: [
        "equals",
        "not_equals",
        "in",
        "not_in",
        "contains",
        "not_contains",
        "gte",
        "lte",
        "gt",
        "lt",
      ],
      required: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const policyRuleSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Policy",
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    conditions: {
      type: [policyRuleConditionSchema],
      required: true,
      validate: {
        validator: (conditions: PolicyRuleCondition[]) => conditions.length > 0,
        message: "A policy rule must contain at least one condition",
      },
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
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

policyRuleSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const rule = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (rule._id) {
      rule.id = rule._id.toString();
    }

    delete rule._id;
    return ret;
  },
});

policyRuleSchema.index({ businessId: 1, policyId: 1, status: 1, priority: -1 });
policyRuleSchema.index({ businessId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 });

export type PolicyRuleDocument = InferSchemaType<typeof policyRuleSchema>;

export const PolicyRule = mongoose.model<PolicyRuleDocument>(
  "PolicyRule",
  policyRuleSchema,
);
