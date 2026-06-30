import mongoose, { InferSchemaType, model } from "mongoose";

export const allowedPermissions = [
  "business:update",
  "members:invite",
  "members:remove",
  "members:update_role",
  "members:update_status",
  "members:view",
  "roles:view",
  "roles:create",
  "roles:update",
  "roles:delete",
  "roles:assign",
  "payments:create",
  "payments:view",
  "payments:view_own",
  "payments:approve",
  "payments:cancel",
  "providers:create",
  "providers:update",
  "providers:view",
  "invoices:create",
  "employee_lists:create",
  "employee_lists:view",
  "employee_lists:update",
  "employee_lists:archive",
  "employees:create",
  "employees:view",
  "employees:update",
  "employees:archive",
  "employees:verify",
  "invoices:view",
  "reports:view",
  "audit_logs:view",
] as const;

export type Permission = (typeof allowedPermissions)[number];

export const systemRolePermissions = {
  owner: [...allowedPermissions],
  admin: [
    "members:invite",
    "members:view",
    "members:update_status",
    "payments:create",
    "payments:approve",
    "payments:view",
    "providers:create",
    "providers:update",
    "invoices:create",
    "invoices:view",
    "reports:view",
    "audit_logs:view",
    "employee_lists:create",
    "employee_lists:view",
    "employee_lists:update",
    "employee_lists:archive",
    "employees:create",
    "employees:view",
    "employees:update",
    "employees:archive",
    "employees:verify",
  ],
  finance_manager: [
    "payments:create",
    "payments:approve",
    "payments:view",
    "providers:create",
    "invoices:create",
    "invoices:view",
    "reports:view",
    "employee_lists:create",
    "employee_lists:view",
    "employee_lists:update",
    "employees:create",
    "employees:view",
    "employees:update",
    "employees:verify",
    "members:view",
  ],
  accountant: [
    "payments:view",
    "invoices:view",
    "reports:view",
    "members:view",
    "employee_lists:view",
    "employees:view",
  ],
  contributor: ["payments:create", "members:view", "payments:view_own"],
  viewer: ["payments:view", "invoices:view", "members:view", "reports:view"],
} satisfies Record<string, Permission[]>;

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

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

roleSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const role = ret as {
      _id?: { toString: () => string };
      id?: string;
    };

    if (role._id) {
      role.id = role._id.toString();
    }

    delete role._id;
    return ret;
  },
});

roleSchema.index(
  { key: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "system" },
  },
);

roleSchema.index(
  { businessId: 1, key: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "custom" },
  },
);
export type RoleDocument = InferSchemaType<typeof roleSchema>;

export const Role = model<RoleDocument>("Role", roleSchema);
