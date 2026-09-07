import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import type { WarpDemoService } from "./warp-demo.service.js";
import * as schemas from "./warp-demo.validators.js";

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export const createWarpDemoController = (service: WarpDemoService) => ({
  createSession: asyncHandler(async (_req, res) => ok(res, await service.createSession())),
  mutate: asyncHandler(async (req: Request, res: Response) => { const parsed = schemas.mutationRequest.parse({ params: req.validatedParams, query: req.validatedQuery, body: req.validatedBody }); return ok(res, await service.mutate(parsed.params.sessionId, parsed.body)); }),
  reset: asyncHandler(async (req: Request, res: Response) => ok(res, await service.reset(schemas.resetRequest.shape.params.parse(req.validatedParams).sessionId))),
  reconciliationRun: asyncHandler(async (req: Request, res: Response) => { const params = schemas.reconciliationRunRequest.shape.params.parse(req.validatedParams); return ok(res, await service.reconciliationRun(params.sessionId, params.runId)); }),
  sessionEmployee: asyncHandler(async (req: Request, res: Response) => ok(res, await service.sessionEmployee(schemas.sessionRequest.shape.params.parse(req.validatedParams).sessionId))),
  sessionEmployeePolicies: asyncHandler(async (req: Request, res: Response) => ok(res, await service.sessionEmployeePolicies(schemas.sessionRequest.shape.params.parse(req.validatedParams).sessionId))),
  sessionExplain: asyncHandler(async (req: Request, res: Response) => ok(res, await service.sessionExplain(schemas.sessionRequest.shape.params.parse(req.validatedParams).sessionId))),
  sessionAudit: asyncHandler(async (req: Request, res: Response) => ok(res, await service.sessionAudit(schemas.sessionRequest.shape.params.parse(req.validatedParams).sessionId))),
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
