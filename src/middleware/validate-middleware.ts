import { NextFunction, Request, Response } from "express";
import { z } from "zod";

type RequestValidationSchema = z.ZodObject<{
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}>;

const validate =
  (schema: RequestValidationSchema) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return next(
        Object.assign(new Error("Validation failed"), {
          statusCode: 400,
          details: result.error.flatten(),
        }),
      );
    }

    req.validatedBody = result.data.body;
    req.validatedParams = result.data.params;
    req.validatedQuery = result.data.query;

    next();
  };

export { validate };
