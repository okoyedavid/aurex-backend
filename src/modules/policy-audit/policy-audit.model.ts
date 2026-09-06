import mongoose, { type InferSchemaType } from "mongoose";

export const policyAuditEntityTypes = [
  "policy_category",
  "policy",
  "policy_rule",
  "employee_policy_assignment",
  "manual_assignment",
  "reconciliation",
] as const;

export const policyAuditActorTypes = ["user", "system", "worker"] as const;

const actorSnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    type: { type: String, enum: policyAuditActorTypes, required: true },
    displayName: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const employeeSnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const policySnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: null },
  },
  { _id: false, versionKey: false },
);

const categorySnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    cardinality: { type: String, enum: ["ONE", "MANY"], required: true },
  },
  { _id: false, versionKey: false },
);

const policyAuditSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
      immutable: true,
    },
    entityType: {
      type: String,
      enum: policyAuditEntityTypes,
      required: true,
      immutable: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    action: { type: String, required: true, trim: true, immutable: true },
    actorType: {
      type: String,
      enum: policyAuditActorTypes,
      required: true,
      immutable: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },
    actorBusinessMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessMember",
      default: null,
      immutable: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      immutable: true,
    },
    policyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Policy",
      default: null,
      immutable: true,
    },
    policyRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyRule",
      default: null,
      immutable: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyCategory",
      default: null,
      immutable: true,
    },
    actorSnapshot: {
      type: actorSnapshotSchema,
      default: undefined,
      immutable: true,
    },
    employeeSnapshot: {
      type: employeeSnapshotSchema,
      default: undefined,
      immutable: true,
    },
    policySnapshot: {
      type: policySnapshotSchema,
      default: undefined,
      immutable: true,
    },
    categorySnapshot: {
      type: categorySnapshotSchema,
      default: undefined,
      immutable: true,
    },
    before: { type: mongoose.Schema.Types.Mixed, default: undefined, immutable: true },
    after: { type: mongoose.Schema.Types.Mixed, default: undefined, immutable: true },
    changedFields: { type: [String], default: undefined, immutable: true },
    reason: { type: String, trim: true, default: null, immutable: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
    correlationId: { type: String, trim: true, default: null, immutable: true },
    reconciliationRunId: { type: String, trim: true, default: null, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

policyAuditSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const audit = ret as { _id?: { toString: () => string }; id?: string };
    if (audit._id) audit.id = audit._id.toString();
    delete audit._id;
    return ret;
  },
});

policyAuditSchema.index({ businessId: 1, occurredAt: -1 });
policyAuditSchema.index({ businessId: 1, employeeId: 1, occurredAt: -1 });
policyAuditSchema.index({ businessId: 1, policyId: 1, occurredAt: -1 });
policyAuditSchema.index({ businessId: 1, policyRuleId: 1, occurredAt: -1 });
policyAuditSchema.index({ businessId: 1, entityType: 1, entityId: 1, occurredAt: -1 });

export type PolicyAuditDocument = InferSchemaType<typeof policyAuditSchema>;
export const PolicyAudit = mongoose.model<PolicyAuditDocument>(
  "PolicyAudit",
  policyAuditSchema,
);
