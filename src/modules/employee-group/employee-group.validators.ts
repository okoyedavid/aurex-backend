import { z } from "zod";
import { defaultEmployeeGroups } from "./employee-group.defaults.js";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { message: "Invalid mongo id" });

const templateKeys = defaultEmployeeGroups.map(({ key }) => key) as [
  (typeof defaultEmployeeGroups)[number]["key"],
  ...(typeof defaultEmployeeGroups)[number]["key"][],
];

export const listEmployeeGroupsSchema = z.object({
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

export const listSystemEmployeeGroupsSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ businessId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

export const createEmployeeGroupSchema = z.object({
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

export const updateEmployeeGroupSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().min(2).max(500).nullable().optional(),
      status: z.enum(["active", "archived"]).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one employee group field is required",
    }),
  params: z
    .object({
      businessId: objectIdSchema,
      employeeGroupId: objectIdSchema,
    })
    .strict(),
  query: z.object({}).strict(),
});
