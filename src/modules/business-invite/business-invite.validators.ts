import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { message: "Invalid mongo id" });

const inviteStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "revoked",
  "expired",
]);

const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: inviteStatusSchema.optional(),
  })
  .strict();

const createBusinessInviteSchema = z.object({
  body: z
    .object({
      email: z.string().trim().toLowerCase().email(),
      roleId: objectIdSchema,
    })
    .strict(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

const listSentBusinessInvitesSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: paginationQuerySchema,
});

const viewBusinessInvitesSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({}).strict(),
  query: paginationQuerySchema,
});

const respondToBusinessInviteSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ inviteId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

const listPendingInviteApprovalsSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict(),
});

const respondToInviteApprovalSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z
    .object({
      businessId: objectIdSchema,
      inviteId: objectIdSchema,
    })
    .strict(),
  query: z.object({}).strict(),
});

export {
  createBusinessInviteSchema,
  listPendingInviteApprovalsSchema,
  listSentBusinessInvitesSchema,
  respondToInviteApprovalSchema,
  respondToBusinessInviteSchema,
  viewBusinessInvitesSchema,
};
