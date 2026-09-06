import mongoose, { type InferSchemaType } from "mongoose";

const githubInstallationAttemptSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    initiatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    initiatedByUserSessionId: { type: String, required: true },
    initiatedByAuthSessionId: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "processing", "consumed"],
      required: true,
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    processingStartedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

githubInstallationAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type GitHubInstallationAttemptDocument = InferSchemaType<
  typeof githubInstallationAttemptSchema
>;

export const GitHubInstallationAttempt =
  mongoose.model<GitHubInstallationAttemptDocument>(
    "GitHubInstallationAttempt",
    githubInstallationAttemptSchema,
  );
