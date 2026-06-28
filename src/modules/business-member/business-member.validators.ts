import z from "zod";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, {
    message: "Invalid mongo id",
  });

const listBusinessMemberSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    businessId: objectIdSchema,
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const getBusinessMemberSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    businessId: objectIdSchema,
    memberId: objectIdSchema,
  }),
  query: z.object({}).strict().optional(),
});

export { listBusinessMemberSchema, getBusinessMemberSchema };
