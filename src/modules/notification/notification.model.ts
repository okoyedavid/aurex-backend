import mongoose, { InferSchemaType, model } from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    auditEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuditEvent",
      required: true,
      index: true,
    },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
    },
    readAt: { type: Date, default: null, index: true },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false },
);

notificationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const notification = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (notification._id) {
      notification.id = notification._id.toString();
    }

    delete notification._id;
    return ret;
  },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export const Notification = model<NotificationDocument>(
  "Notification",
  notificationSchema,
);
