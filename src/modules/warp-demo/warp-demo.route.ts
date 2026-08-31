import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate-middleware.js";
import { warpDemoLimiter } from "../../middleware/rate-limit.middleware.js";
import { warpDemoController } from "./warp-demo.module.js";
import * as schemas from "./warp-demo.validators.js";

type Controller = typeof warpDemoController;

export const createWarpDemoRouter = (
  controller: Controller,
  limiter: RequestHandler,
) => {
  const router = Router();
  router.use(limiter);
  router.get("/overview", validate(schemas.emptyRequest), controller.overview);
  router.get("/employees", validate(schemas.emptyRequest), controller.employees);
  router.get("/employees/:employeeId", validate(schemas.employeeRequest), controller.employee);
  router.get("/employees/:employeeId/policies", validate(schemas.employeeRequest), controller.employeePolicies);
  router.get("/employees/:employeeId/explain", validate(schemas.employeeRequest), controller.explain);
  router.get("/policy-categories", validate(schemas.emptyRequest), controller.categories);
  router.get("/policies", validate(schemas.policiesRequest), controller.policies);
  router.get("/policies/:policyId", validate(schemas.policyRequest), controller.policy);
  router.get("/audit", validate(schemas.auditRequest), controller.audit);
  return router;
};

export const warpDemoRouter = createWarpDemoRouter(warpDemoController, warpDemoLimiter);
