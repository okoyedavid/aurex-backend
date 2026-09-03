import { Router, type RequestHandler } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { policyController } from "./policy.module.js";
import * as schemas from "./policy.validators.js";

const router = Router({ mergeParams: true });
const guarded = (permission: Parameters<typeof requireBusinessPermission>[0], schema: Parameters<typeof validate>[0], handler: RequestHandler) => [protect, validate(schema), requireBusinessPermission(permission), handler] as const;
const auditGuarded = (schema: Parameters<typeof validate>[0], handler: RequestHandler) => [
  protect,
  validate(schema),
  requireBusinessPermission("audit_logs:view"),
  requireBusinessPermission("policies:view_audit"),
  handler,
] as const;

router.get("/:businessId/policy-categories", ...guarded("policies:view", schemas.listCategoriesSchema, policyController.listCategories));
router.post("/:businessId/policy-categories", ...guarded("policies:create", schemas.createCategorySchema, policyController.createCategory));
router.get("/:businessId/policy-categories/:categoryId", ...guarded("policies:view", schemas.categoryParamsSchema, policyController.getCategory));
router.patch("/:businessId/policy-categories/:categoryId", ...guarded("policies:update", schemas.updateCategorySchema, policyController.updateCategory));
router.post("/:businessId/policy-categories/:categoryId/archive", ...guarded("policies:archive", schemas.categoryParamsSchema, policyController.archiveCategory));

router.get("/:businessId/policies", ...guarded("policies:view", schemas.listPoliciesSchema, policyController.listPolicies));
router.post("/:businessId/policies", ...guarded("policies:create", schemas.createPolicySchema, policyController.createPolicy));
router.get("/:businessId/policies/:policyId", ...guarded("policies:view", schemas.policyParamsSchema, policyController.getPolicy));
router.patch("/:businessId/policies/:policyId", ...guarded("policies:update", schemas.updatePolicySchema, policyController.updatePolicy));
router.post("/:businessId/policies/:policyId/activate", ...guarded("policies:update", schemas.policyParamsSchema, policyController.activatePolicy));
router.post("/:businessId/policies/:policyId/archive", ...guarded("policies:archive", schemas.policyParamsSchema, policyController.archivePolicy));
router.get("/:businessId/policies/:policyId/rules", ...guarded("policies:view", schemas.listRulesSchema, policyController.listRules));
router.post("/:businessId/policies/:policyId/rules", ...guarded("policies:update", schemas.createRuleSchema, policyController.createRule));
router.get("/:businessId/policy-rules/:ruleId", ...guarded("policies:view", schemas.ruleParamsSchema, policyController.getRule));
router.patch("/:businessId/policy-rules/:ruleId", ...guarded("policies:update", schemas.updateRuleSchema, policyController.updateRule));
router.post("/:businessId/policy-rules/:ruleId/enable", ...guarded("policies:update", schemas.ruleParamsSchema, policyController.enableRule));
router.post("/:businessId/policy-rules/:ruleId/disable", ...guarded("policies:update", schemas.ruleParamsSchema, policyController.disableRule));

router.get("/:businessId/employees/:employeeId/policies/explain", ...guarded("policies:view", schemas.employeePoliciesSchema, policyController.explainEmployeePolicies));
router.get("/:businessId/employees/:employeeId/policies", ...guarded("policies:view", schemas.employeePoliciesSchema, policyController.employeePolicies));
router.post("/:businessId/employees/:employeeId/policies/reconcile", ...guarded("policies:reconcile", schemas.reconcileEmployeeSchema, policyController.reconcileEmployee));
router.post("/:businessId/employees/:employeeId/policies/:policyId/manual", ...guarded("policies:assign", schemas.manualAssignmentSchema, policyController.createManualAssignment));
router.post("/:businessId/employees/:employeeId/policies/:policyId/manual/end", ...guarded("policies:assign", schemas.endManualAssignmentSchema, policyController.endManualAssignment));
router.post("/:businessId/policies/reconcile", ...guarded("policies:reconcile", schemas.reconcileBusinessSchema, policyController.reconcileBusiness));
router.get("/:businessId/policy-audit", ...auditGuarded(schemas.listAuditSchema, policyController.listAudit));
router.get("/:businessId/employees/:employeeId/policy-history", ...auditGuarded(schemas.employeeHistorySchema, policyController.employeeHistory));
router.get("/:businessId/policies/:policyId/history", ...auditGuarded(schemas.policyHistorySchema, policyController.policyHistory));
router.get("/:businessId/policy-rules/:ruleId/history", ...auditGuarded(schemas.ruleHistorySchema, policyController.ruleHistory));

export { router as policyRouter };
