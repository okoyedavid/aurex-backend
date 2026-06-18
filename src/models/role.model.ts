import mongoose, { InferSchemaType, model } from "mongoose";

const allowedPermissions = [
  "business:update",
  "members:invite",
  "members:remove",
  "members:update_role",
  "payments:create",
  "payments:view",
  "payments:view_own",
  "payments:approve",
  "payments:cancel",
  "providers:create",
  "providers:update",
  "providers:view",
  "invoices:create",
  "invoices:view",
  "reports:view",
  "audit_logs:view",
] as const;

type Permission = (typeof allowedPermissions)[number];

const systemRolePermissions: Record<string, Permission[] | ["*"]> = {
  owner: [...allowedPermissions],
  admin: [
    "members:invite",
    "members:update_role",
    "payments:create",
    "payments:approve",
    "payments:view",
    "providers:create",
    "providers:update",
    "invoices:create",
    "invoices:view",
    "reports:view",
    "audit_logs:view",
  ],
  finance_manager: [
    "payments:create",
    "payments:approve",
    "payments:view",
    "providers:create",
    "invoices:create",
    "invoices:view",
    "reports:view",
  ],
  accountant: ["payments:view", "invoices:view", "reports:view"],
  contributor: ["payments:create", "payments:view_own"],
  viewer: ["payments:view", "invoices:view", "reports:view"],
};
const roleSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["system", "custom"],
      required: true,
      index: true,
    },

    permissions: {
      type: [String],
      enum: [...allowedPermissions],
      default: [],
    },

    deniedPermissions: {
      type: [String],
      enum: allowedPermissions,
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

export type RoleDocument = InferSchemaType<typeof roleSchema>;

export const Role = model<RoleDocument>("Role", roleSchema);
