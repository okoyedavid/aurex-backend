import mongoose, { type InferSchemaType } from "mongoose";

const githubConnectionSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, unique: true, index: true },
    installationId: { type: Number, default: null },
    accountId: { type: Number, default: null },
    accountLogin: { type: String, trim: true, default: null },
    accountType: { type: String, enum: ["Organization", "User"], default: null },
    status: { type: String, enum: ["active", "suspended", "disconnected"], required: true, default: "disconnected", index: true },
    repositorySelection: { type: String, enum: ["all", "selected"], default: null },
    connectedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

githubConnectionSchema.index(
  { installationId: 1 },
  { unique: true, partialFilterExpression: { installationId: { $type: "number" } } },
);
githubConnectionSchema.set("toJSON", { transform: (_doc, ret) => { const value = ret as { _id?: { toString(): string }; id?: string }; if (value._id) value.id = value._id.toString(); delete value._id; return ret; } });

export type GitHubConnectionDocument = InferSchemaType<typeof githubConnectionSchema>;
export const GitHubConnection = mongoose.model<GitHubConnectionDocument>("GitHubConnection", githubConnectionSchema);
