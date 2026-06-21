import { z } from "zod";

const revokeSessionSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({
    userSessionId: z.string().uuid(),
  }),
  query: z.object({}),
});

const revokeOtherSessionsSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({}),
  query: z.object({}),
});

export { revokeOtherSessionsSchema, revokeSessionSchema };
