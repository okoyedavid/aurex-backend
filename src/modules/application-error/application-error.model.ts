import mongoose, { InferSchemaType, model } from "mongoose";

const applicationErrorSchema = new mongoose.Schema(
  {
    errorId: { type: String, required: true, unique: true, trim: true },
    requestId: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    code: { type: String, default: null, trim: true, index: true },
    stack: { type: String, default: null },
    statusCode: { type: Number, required: true, index: true },
    method: { type: String, required: true, trim: true },
    path: { type: String, required: true, trim: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    userSessionId: { type: String, default: null, index: true },
    authSessionId: { type: String, default: null },
    ipAddress: { type: String, default: null, index: true },
    userAgent: { type: String, default: null },
    deviceName: { type: String, default: null },
    environment: { type: String, required: true, trim: true, index: true },
    release: { type: String, default: null, trim: true },
    resolvedAt: { type: Date, default: null, index: true },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false },
);

applicationErrorSchema.index({ environment: 1, createdAt: -1 });
applicationErrorSchema.index({ statusCode: 1, createdAt: -1 });
applicationErrorSchema.index({ path: 1, createdAt: -1 });

export type CreateApplicationErrorPayload = {
  errorId: string;
  requestId: string;
  name: string;
  message: string;
  statusCode: number;
  method: string;
  path: string;
  environment: string;

  code?: string | null;
  stack?: string | null;
  userId?: mongoose.Types.ObjectId | string | null;
  userSessionId?: string | null;
  authSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
  release?: string | null;
  resolvedAt?: Date | null;
  createdAt?: Date;
};

export type ApplicationErrorDocument = InferSchemaType<
  typeof applicationErrorSchema
>;

export const ApplicationError = model<ApplicationErrorDocument>(
  "ApplicationError",
  applicationErrorSchema,
);
