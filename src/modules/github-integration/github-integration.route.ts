import { Router, type RequestHandler } from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { requireBusinessPermission } from "../../middleware/business-permission.middleware.js";
import { validate } from "../../middleware/validate-middleware.js";
import { githubIntegrationController } from "./github-integration.module.js";
import * as schemas from "./github-integration.validators.js";

const router = Router({ mergeParams: true });
const guarded = (permission: Parameters<typeof requireBusinessPermission>[0], schema: Parameters<typeof validate>[0], handler: RequestHandler) => [protect, validate(schema), requireBusinessPermission(permission), handler] as const;

router.get("/:businessId/integrations/github", ...guarded("integrations:view", schemas.connectionSchema, githubIntegrationController.getConnection));
router.post("/:businessId/integrations/github/install-url", ...guarded("integrations:manage", schemas.connectionSchema, githubIntegrationController.createInstallUrl));
router.post("/:businessId/integrations/github/complete", ...guarded("integrations:manage", schemas.completeInstallationSchema, githubIntegrationController.completeInstallation));
router.delete("/:businessId/integrations/github", ...guarded("integrations:manage", schemas.connectionSchema, githubIntegrationController.disconnect));
router.get("/:businessId/integrations/github/repositories", ...guarded("integrations:view", schemas.connectionSchema, githubIntegrationController.listRepositories));
router.get("/:businessId/integrations/github/teams", ...guarded("integrations:view", schemas.connectionSchema, githubIntegrationController.listTeams));

router.get("/:businessId/employees/:employeeId/external-identities/github", ...guarded("employees:view", schemas.employeeIdentitySchema, githubIntegrationController.getIdentity));
router.put("/:businessId/employees/:employeeId/external-identities/github", ...guarded("employees:update", schemas.setEmployeeIdentitySchema, githubIntegrationController.setIdentity));
router.delete("/:businessId/employees/:employeeId/external-identities/github", ...guarded("employees:update", schemas.employeeIdentitySchema, githubIntegrationController.removeIdentity));
router.get("/:businessId/employees/:employeeId/external-access", ...guarded("policies:view", schemas.employeeIdentitySchema, githubIntegrationController.getEmployeeAccess));

export { router as githubIntegrationRouter };
