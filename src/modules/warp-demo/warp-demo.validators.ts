import { z } from "zod";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid mongo id");
const empty = z.object({}).strict();

export const emptyRequest = z.object({
  body: empty.optional(),
  params: empty,
  query: empty,
});

export const employeeRequest = z.object({
  body: empty.optional(),
  params: z.object({ employeeId: objectId }).strict(),
  query: empty,
});

export const policyRequest = z.object({
  body: empty.optional(),
  params: z.object({ policyId: objectId }).strict(),
  query: empty,
});

export const policiesRequest = z.object({
  body: empty.optional(),
  params: empty,
  query: z.object({
    categoryId: objectId.optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
  }).strict(),
});

export const auditRequest = z.object({
  body: empty.optional(),
  params: empty,
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    employeeId: objectId.optional(),
    policyId: objectId.optional(),
    action: z.string().trim().min(1).max(100).optional(),
  }).strict(),
});
