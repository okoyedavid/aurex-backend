import mongoose, { type InferSchemaType } from "mongoose";

const externalAccessGrantSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "EmployeePolicyAssignment", required: true, index: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: "Policy", required: true, index: true },
    policyVersion: { type: Number, required: true, min: 1 },
    assignmentSource: { type: String, enum: ["rule", "manual"], required: true },
    provider: { type: String, enum: ["github"], required: true, default: "github", index: true },
    resourceType: { type: String, enum: ["team", "repository"], required: true },
    resourceExternalId: { type: String, required: true },
    resourceDisplayName: { type: String, required: true },
    target: { type: mongoose.Schema.Types.Mixed, required: true },
    desiredState: { type: String, enum: ["granted", "revoked"], required: true, index: true },
    desiredRevision: { type: Number, required: true, default: 1, min: 1 },
    actualState: { type: String, enum: ["unknown", "pending", "granted", "revoked", "drifted", "blocked", "needs_configuration", "failed", "pending_acceptance", "retained_external"], required: true, default: "unknown", index: true },
    managedByAurex: { type: Boolean, required: true, default: true },
    managedGrantCreated: { type: Boolean, required: true, default: false },
    baselinePermission: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null },
    lastErrorMessage: { type: String, default: null },
    lastAuditState: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
externalAccessGrantSchema.index({ businessId: 1, assignmentId: 1, resourceType: 1, resourceExternalId: 1 }, { unique: true });
externalAccessGrantSchema.index({ businessId: 1, managedByAurex: 1, desiredState: 1, _id: 1 });
externalAccessGrantSchema.set("toJSON", { transform: (_doc, ret) => { const value = ret as { _id?: { toString(): string }; id?: string; lastAuditState?: string | null }; if (value._id) value.id = value._id.toString(); delete value._id; delete value.lastAuditState; return ret; } });

export type ExternalAccessGrantDocument = InferSchemaType<typeof externalAccessGrantSchema>;
export const ExternalAccessGrant = mongoose.model<ExternalAccessGrantDocument>("ExternalAccessGrant", externalAccessGrantSchema);
