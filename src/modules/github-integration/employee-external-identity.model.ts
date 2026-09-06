import mongoose, { type InferSchemaType } from "mongoose";

const employeeExternalIdentitySchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    provider: { type: String, enum: ["github"], required: true, default: "github", index: true },
    externalId: { type: Number, default: null },
    username: { type: String, required: true, trim: true },
    verificationStatus: { type: String, enum: ["unverified", "verified"], required: true, default: "unverified" },
  },
  { timestamps: true, versionKey: false },
);
employeeExternalIdentitySchema.index({ businessId: 1, employeeId: 1, provider: 1 }, { unique: true });
employeeExternalIdentitySchema.index({ businessId: 1, provider: 1, externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: "number" } } });
employeeExternalIdentitySchema.set("toJSON", { transform: (_doc, ret) => { const value = ret as { _id?: { toString(): string }; id?: string }; if (value._id) value.id = value._id.toString(); delete value._id; return ret; } });

export type EmployeeExternalIdentityDocument = InferSchemaType<typeof employeeExternalIdentitySchema>;
export const EmployeeExternalIdentity = mongoose.model<EmployeeExternalIdentityDocument>("EmployeeExternalIdentity", employeeExternalIdentitySchema);
