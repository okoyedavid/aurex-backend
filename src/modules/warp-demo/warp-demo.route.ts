import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate-middleware.js";
import { warpDemoLimiter, warpDemoMutationLimiter, warpDemoSessionLimiter } from "../../middleware/rate-limit.middleware.js";
import { warpDemoController } from "./warp-demo.module.js";
import * as schemas from "./warp-demo.validators.js";

type Controller = typeof warpDemoController;

export const createWarpDemoRouter = (
  controller: Controller,
  limiter: RequestHandler,
  sessionLimiter: RequestHandler = limiter,
  mutationLimiter: RequestHandler = limiter,
) => {
  const router = Router();
  router.use(limiter);
  router.post("/session", sessionLimiter, validate(schemas.createSessionRequest), controller.createSession);
  router.post("/session/:sessionId/mutations", mutationLimiter, validate(schemas.mutationRequest), controller.mutate);
  router.post("/session/:sessionId/reset", mutationLimiter, validate(schemas.resetRequest), controller.reset);
  router.get("/session/:sessionId/reconciliation/:runId", validate(schemas.reconciliationRunRequest), controller.reconciliationRun);
  router.get("/session/:sessionId/employee", validate(schemas.sessionRequest), controller.sessionEmployee);
  router.get("/session/:sessionId/employee/policies", validate(schemas.sessionRequest), controller.sessionEmployeePolicies);
  router.get("/session/:sessionId/employee/explain", validate(schemas.sessionRequest), controller.sessionExplain);
  router.get("/session/:sessionId/audit", validate(schemas.sessionRequest), controller.sessionAudit);
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

export const warpDemoRouter = createWarpDemoRouter(warpDemoController, warpDemoLimiter, warpDemoSessionLimiter, warpDemoMutationLimiter);
