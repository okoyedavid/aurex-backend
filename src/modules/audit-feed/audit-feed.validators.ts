import { z } from "zod";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid mongo id");
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const params = z.object({ businessId: objectId }).strict();

export const listBusinessAuditSchema = z.object({
  body: z.object({}).strict().optional(),
  params,
  query: pagination.extend({
    domain: z.enum(["business", "member", "employee", "policy", "security"]).optional(),
    action: z.string().trim().min(1).max(100).optional(),
    actorId: objectId.optional(),
    employeeId: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }).strict(),
});

export const listPersonalAuditSchema = z.object({
  body: z.object({}).strict().optional(),
  params,
  query: pagination.strict(),
});
