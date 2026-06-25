import z from "zod";

export const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, {
  message: "Invalid business id",
});

const createBusinessSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(50),
    profile_img: z.string().trim().min(8).max(250).optional(),
    industry: z.string().trim().min(2).max(80),
  }),

  params: z.object({}),
  query: z.object({}),
});

const updateProfileImgSchema = z.object({
  body: z.object({
    profile_img: z.string().trim().url(),
    businessId: objectIdSchema,
  }),
  params: z.object({}),
  query: z.object({}),
});

const deleteProfileImgSchema = z.object({
  body: z.object({
    businessId: objectIdSchema,
  }),
  params: z.object({}),
  query: z.object({}),
});

const getBusinessSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    businessId: objectIdSchema,
  }),
  query: z.object({}),
});

const listBusinessesSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    ownerOnly: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  }),
});

export {
  createBusinessSchema,
  deleteProfileImgSchema,
  getBusinessSchema,
  listBusinessesSchema,
  updateProfileImgSchema,
};
