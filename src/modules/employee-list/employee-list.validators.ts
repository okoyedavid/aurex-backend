import { z } from "zod";
import { employeeInputSchema } from "../employee/employee.validators.js";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, {
    message: "Invalid mongo id",
  });

const employeeListInputSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().min(2).optional(),

    currency: z.string().trim().length(3).toUpperCase().optional(),
    payFrequency: z
      .enum(["monthly", "bi-weekly", "weekly", "one_time"])
      .optional(),
    employees: z.array(employeeInputSchema).max(50).optional(),
  })
  .strict();

const createEmployeeListSchema = z.object({
  body: employeeListInputSchema,
  params: z.object({ businessId: objectIdSchema }),
  query: z.object({}),
});

const getEmployeeListVerificationStatusSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    businessId: objectIdSchema,
    employeeListId: objectIdSchema,
  }),
  query: z.object({}),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const employeeListParamsSchema = z.object({
  businessId: objectIdSchema,
  employeeListId: objectIdSchema,
});

const listEmployeeListsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ businessId: objectIdSchema }),
  query: paginationQuerySchema,
});

const getEmployeeListSchema = z.object({
  body: z.object({}).optional(),
  params: employeeListParamsSchema,
  query: z.object({}),
});

const updateEmployeeListSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(50).optional(),
      description: z.string().trim().min(2).nullable().optional(),
      currency: z.string().trim().length(3).toUpperCase().optional(),
      defaultPayFrequency: z
        .enum(["monthly", "bi-weekly", "weekly", "one_time"])
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one employee list field is required",
    }),
  params: employeeListParamsSchema,
  query: z.object({}),
});

export {
  createEmployeeListSchema,
  employeeListInputSchema,
  getEmployeeListSchema,
  getEmployeeListVerificationStatusSchema,
  listEmployeeListsSchema,
  updateEmployeeListSchema,
};
