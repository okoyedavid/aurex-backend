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

const businessMemberParamsSchema = z
  .object({
    businessId: objectIdSchema,
    memberId: objectIdSchema,
  })
  .strict();

const updateBusinessMemberRoleSchema = z.object({
  body: z.object({ roleId: objectIdSchema }).strict(),
  params: businessMemberParamsSchema,
  query: z.object({}).strict(),
});

const updateBusinessMemberStatusSchema = z.object({
  body: z.object({ status: z.enum(["active", "suspended"]) }).strict(),
  params: businessMemberParamsSchema,
  query: z.object({}).strict(),
});

const removeBusinessMemberSchema = z.object({
  body: z.object({}).strict().optional(),
  params: businessMemberParamsSchema,
  query: z.object({}).strict(),
});

export {
  getBusinessMemberSchema,
  listBusinessMemberSchema,
  removeBusinessMemberSchema,
  updateBusinessMemberRoleSchema,
  updateBusinessMemberStatusSchema,
};
