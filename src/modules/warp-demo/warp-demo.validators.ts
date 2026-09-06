import { z } from "zod";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid mongo id");
const empty = z.object({}).strict();
const sessionId = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid demo session");
const runId = z.string().uuid("Invalid reconciliation run");

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

const mutation = z.discriminatedUnion("field", [
  z.object({ employee: z.literal("maya"), field: z.literal("department"), value: z.enum(["engineering", "finance"]) }).strict(),
  z.object({ employee: z.literal("maya"), field: z.literal("employeeType"), value: z.enum(["full_time", "contractor"]) }).strict(),
  z.object({ employee: z.literal("maya"), field: z.literal("state"), value: z.enum(["california", "new_york"]) }).strict(),
  z.object({ employee: z.literal("maya"), field: z.literal("remoteGroup"), value: z.enum(["member", "not_member"]) }).strict(),
]);

export type WarpDemoMutation = z.infer<typeof mutation>;

export const createSessionRequest = z.object({ body: empty.optional(), params: empty, query: empty });
export const mutationRequest = z.object({ body: mutation, params: z.object({ sessionId }).strict(), query: empty });
export const resetRequest = z.object({ body: empty.optional(), params: z.object({ sessionId }).strict(), query: empty });
export const reconciliationRunRequest = z.object({ body: empty.optional(), params: z.object({ sessionId, runId }).strict(), query: empty });
