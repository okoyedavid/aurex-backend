import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import type { WarpDemoService } from "./warp-demo.service.js";
import * as schemas from "./warp-demo.validators.js";

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export const createWarpDemoController = (service: WarpDemoService) => ({
  overview: asyncHandler(async (_req, res) => ok(res, await service.overview())),
  employees: asyncHandler(async (_req, res) => ok(res, await service.employees())),
  employee: asyncHandler(async (req: Request, res: Response) => ok(res, await service.employee(schemas.employeeRequest.shape.params.parse(req.validatedParams).employeeId))),
  employeePolicies: asyncHandler(async (req: Request, res: Response) => ok(res, await service.employeePolicies(schemas.employeeRequest.shape.params.parse(req.validatedParams).employeeId))),
  explain: asyncHandler(async (req: Request, res: Response) => ok(res, await service.explain(schemas.employeeRequest.shape.params.parse(req.validatedParams).employeeId))),
  categories: asyncHandler(async (_req, res) => ok(res, await service.categories())),
  policies: asyncHandler(async (req: Request, res: Response) => ok(res, await service.policies(schemas.policiesRequest.shape.query.parse(req.validatedQuery)))),
  policy: asyncHandler(async (req: Request, res: Response) => ok(res, await service.policy(schemas.policyRequest.shape.params.parse(req.validatedParams).policyId))),
  audit: asyncHandler(async (req: Request, res: Response) => ok(res, await service.audit(schemas.auditRequest.shape.query.parse(req.validatedQuery)))),
});
