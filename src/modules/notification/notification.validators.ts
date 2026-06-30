import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { message: "Invalid mongo id" });

const booleanQuerySchema = z.preprocess((value) => {
  if (value === undefined) return false;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}, z.boolean());

const listNotificationsSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({}).strict(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      unreadOnly: booleanQuerySchema,
    })
    .strict(),
});

const markAllNotificationsReadSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});

const markNotificationReadSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({ notificationId: objectIdSchema }).strict(),
  query: z.object({}).strict(),
});

export {
  listNotificationsSchema,
  markAllNotificationsReadSchema,
  markNotificationReadSchema,
};
