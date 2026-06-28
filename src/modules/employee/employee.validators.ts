import { z } from "zod";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, {
    message: "Invalid mongo id",
  });

const employeeInputSchema = z
  .object({
    fullName: z.string().trim().min(2).max(50),
    jobTitle: z.string().trim().min(2).optional(),

    bankCode: z.string().trim().regex(/^\d{3,6}$/, {
      message: "Bank code must contain 3 to 6 digits",
    }),
    bankName: z.string().trim().min(2),
    accountNumber: z.string().trim().regex(/^\d{10}$/, {
      message: "Account number must contain exactly 10 digits",
    }),
    amount: z.number().positive(),

    currency: z.string().trim().length(3).toUpperCase().optional(),
    payFrequency: z
      .enum(["monthly", "bi-weekly", "weekly", "one_time"])
      .optional(),
  })
  .strict();

const createEmployeeSchema = z.object({
  body: employeeInputSchema,
  params: z.object({
    businessId: objectIdSchema,
    employeeListId: objectIdSchema,
  }),
  query: z.object({}),
});

const employeeParamsSchema = z.object({
  businessId: objectIdSchema,
  employeeListId: objectIdSchema,
  employeeId: objectIdSchema,
});

const listEmployeesSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    businessId: objectIdSchema,
    employeeListId: objectIdSchema,
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const getEmployeeSchema = z.object({
  body: z.object({}).optional(),
  params: employeeParamsSchema,
  query: z.object({}),
});

const updateEmployeeSchema = z.object({
  body: z
    .object({
      fullName: z.string().trim().min(2).max(50).optional(),
      jobTitle: z.string().trim().min(2).nullable().optional(),
      bankCode: z.string().trim().regex(/^\d{3,6}$/).optional(),
      bankName: z.string().trim().min(2).optional(),
      accountNumber: z.string().trim().regex(/^\d{10}$/).optional(),
      amount: z.number().positive().optional(),
      currency: z.string().trim().length(3).toUpperCase().optional(),
      payFrequency: z
        .enum(["monthly", "bi-weekly", "weekly", "one_time"])
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one employee field is required",
    }),
  params: employeeParamsSchema,
  query: z.object({}),
});

export {
  createEmployeeSchema,
  employeeInputSchema,
  getEmployeeSchema,
  listEmployeesSchema,
  updateEmployeeSchema,
};
