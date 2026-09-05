import { z } from "zod";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid mongo id");
const empty = z.object({}).strict();
const businessParams = z.object({ businessId: objectId }).strict();
const employeeParams = businessParams.extend({ employeeId: objectId });

export const connectionSchema = z.object({ params: businessParams, query: empty, body: empty.optional() });
export const completeInstallationSchema = z.object({ params: businessParams, query: empty, body: z.object({ installationId: z.coerce.number().int().positive(), state: z.string().min(20).max(500) }).strict() });
export const employeeIdentitySchema = z.object({ params: employeeParams, query: empty, body: empty.optional() });
export const setEmployeeIdentitySchema = z.object({ params: employeeParams, query: empty, body: z.object({ username: z.string().trim().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i, "Invalid GitHub username") }).strict() });

