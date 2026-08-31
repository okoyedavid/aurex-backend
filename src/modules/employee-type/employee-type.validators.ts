import { z } from "zod";
import { defaultEmployeeTypes } from "./employee-type.defaults.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { message: "Invalid mongo id" });

const templateKeys = defaultEmployeeTypes.map(({ key }) => key) as [
  (typeof defaultEmployeeTypes)[number]["key"],
  ...(typeof defaultEmployeeTypes)[number]["key"][],
];

const employeeTypeParamsSchema = z
  .object({
    businessId: objectIdSchema,
    employeeTypeId: objectIdSchema.optional(),
  })
  .strict();

export const listEmployeeTypesSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(["active", "archived"]).default("active"),
    })
    .strict(),
});

export const listSystemEmployeeTypesSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

export const createEmployeeTypeSchema = z.object({
  body: z.union([
    z.object({ templateKey: z.enum(templateKeys) }).strict(),
    z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().min(2).max(500).nullable().optional(),
      })
      .strict(),
  ]),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

export const updateEmployeeTypeSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().min(2).max(500).nullable().optional(),
      status: z.enum(["active", "archived"]).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one employee type field is required",
    }),
  params: employeeTypeParamsSchema.extend({
    employeeTypeId: objectIdSchema,
  }),
  query: z.object({}).strict(),
});
