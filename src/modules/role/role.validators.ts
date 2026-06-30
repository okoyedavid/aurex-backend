import { z } from "zod";
import { allowedPermissions } from "./role.model.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { message: "Invalid mongo id" });

const permissionSchema = z.enum(allowedPermissions);
const rolePermissionsSchema = z
  .array(permissionSchema)
  .max(allowedPermissions.length)
  .refine((permissions) => new Set(permissions).size === permissions.length, {
    message: "Permissions must not contain duplicates",
  });
const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const businessRoleParamsSchema = z
  .object({
    businessId: objectIdSchema,
    roleId: objectIdSchema,
  })
  .strict();

const listRolesSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: paginationQuerySchema,
});

const getRoleSchema = z.object({
  body: z.object({}).strict().optional(),
  params: businessRoleParamsSchema,
  query: z.object({}).strict(),
});

const createCustomRoleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(50),
      permissions: rolePermissionsSchema.default([]),
      deniedPermissions: rolePermissionsSchema.default([]),
    })
    .strict(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

const updateCustomRoleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(50).optional(),
      permissions: rolePermissionsSchema.optional(),
      deniedPermissions: rolePermissionsSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one role field is required",
    }),
  params: businessRoleParamsSchema,
  query: z.object({}).strict(),
});

export {
  createCustomRoleSchema,
  getRoleSchema,
  listRolesSchema,
  updateCustomRoleSchema,
};
