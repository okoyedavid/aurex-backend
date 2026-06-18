import mongoose, { InferSchemaType, model } from "mongoose";

const auditEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true },
    eventType: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      required: true,
      enum: ["authentication", "account", "session", "security"],
      index: true,
    },
    outcome: {
      type: String,
      required: true,
      enum: ["success", "failure", "blocked"],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    emailHash: { type: String, default: null, index: true },
    userSessionId: { type: String, default: null, index: true },
    authSessionId: { type: String, default: null },
    requestId: { type: String, default: null, index: true },
    ipAddress: { type: String, default: null, index: true },
    userAgent: { type: String, default: null },
    deviceName: { type: String, default: null },
    city: { type: String, default: null },
    region: { type: String, default: null },
    country: { type: String, default: null },
    reason: { type: String, default: null },
    changes: {
      fields: { type: [String], default: undefined },
      before: { type: mongoose.Schema.Types.Mixed, default: undefined },
      after: { type: mongoose.Schema.Types.Mixed, default: undefined },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false },
);

auditEventSchema.index({ userId: 1, createdAt: -1 });
auditEventSchema.index({ emailHash: 1, createdAt: -1 });
auditEventSchema.index({ ipAddress: 1, createdAt: -1 });
auditEventSchema.index({ eventType: 1, createdAt: -1 });

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;

export type CreateAuditEventPayload = {
  eventId: string;
  eventType: string;
  category: "authentication" | "account" | "session" | "security";
  outcome: "success" | "failure" | "blocked";
  severity?: "info" | "warning" | "error" | "critical";

  userId?: mongoose.Types.ObjectId | string | null;
  emailHash?: string | null;
  userSessionId?: string | null;
  authSessionId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;

  city?: string | null;
  region?: string | null;
  country?: string | null;

  reason?: string | null;

  changes?: {
    fields?: string[];
    before?: unknown;
    after?: unknown;
  };

  metadata?: unknown;
};

export const AuditEvent = model<AuditEventDocument>(
  "AuditEvent",
  auditEventSchema,
);
