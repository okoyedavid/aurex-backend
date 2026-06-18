import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

const notFound = (req: Request, _res: Response, next: NextFunction) => {
  const error = new ApiError(404, `Route not found: ${req.originalUrl}`);

  next(error);
};

export { notFound };
