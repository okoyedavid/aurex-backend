import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/async-handler.js";
import type { ExternalAccessReconciliationService } from "./external-access-reconciliation.service.js";
import {
  GitHubCallbackError,
  type GitHubConnectionService,
} from "./github-connection.service.js";
import * as schemas from "./github-integration.validators.js";

const ok = (res: Response, data: unknown, message: string, status = 200) => res.status(status).json({ success: true, message, data });

const callbackRedirect = (
  businessId: string | null,
  result: { github: "connected" } | { github: "error"; reason: string },
) => {
  const path = businessId
    ? `/business/${encodeURIComponent(businessId)}/settings/integrations`
    : "/settings/integrations";
  const destination = new URL(path, env.CLIENT_URL);
  for (const [key, value] of Object.entries(result)) {
    destination.searchParams.set(key, value);
  }
  return destination.toString();
};

export const createGitHubIntegrationController = ({ connectionService, externalAccessService }: { connectionService: GitHubConnectionService; externalAccessService: ExternalAccessReconciliationService }) => ({
  getConnection: asyncHandler(async (req: Request, res: Response) => { const { businessId } = schemas.connectionSchema.shape.params.parse(req.validatedParams); return ok(res, await connectionService.getConnection(businessId), "GitHub connection retrieved"); }),
  createInstallUrl: asyncHandler(async (req: Request, res: Response) => { const { businessId } = schemas.connectionSchema.shape.params.parse(req.validatedParams); return ok(res, await connectionService.createInstallUrl(businessId, req.user!.id, req.user!.userSessionId, req.user!.sessionId), "GitHub installation URL created"); }),
  callback: asyncHandler(async (req: Request, res: Response) => {
    const query = schemas.callbackQuerySchema.safeParse(req.query);
    if (!query.success) {
      const reason = typeof req.query.state === "string"
        ? "authorization_failed"
        : "invalid_state";
      return res.redirect(303, callbackRedirect(null, { github: "error", reason }));
    }
    try {
      const result = await connectionService.completeOAuthCallback(
        query.data.code,
        query.data.state,
        query.data.installation_id,
      );
      return res.redirect(303, callbackRedirect(result.businessId, { github: "connected" }));
    } catch (error) {
      const failure = error instanceof GitHubCallbackError
        ? error
        : new GitHubCallbackError("authorization_failed");
      console.error("GitHub callback failed", { reason: failure.reason });
      return res.redirect(303, callbackRedirect(failure.businessId, {
        github: "error",
        reason: failure.reason,
      }));
    }
  }),
  disconnect: asyncHandler(async (req: Request, res: Response) => { const { businessId } = schemas.connectionSchema.shape.params.parse(req.validatedParams); return ok(res, await connectionService.disconnect(businessId, req.user!.id), "GitHub disconnected"); }),
  listRepositories: asyncHandler(async (req: Request, res: Response) => { const { businessId } = schemas.connectionSchema.shape.params.parse(req.validatedParams); return ok(res, { items: await connectionService.listRepositories(businessId) }, "GitHub repositories retrieved"); }),
  listTeams: asyncHandler(async (req: Request, res: Response) => { const { businessId } = schemas.connectionSchema.shape.params.parse(req.validatedParams); return ok(res, { items: await connectionService.listTeams(businessId) }, "GitHub teams retrieved"); }),
  getIdentity: asyncHandler(async (req: Request, res: Response) => { const { businessId, employeeId } = schemas.employeeIdentitySchema.shape.params.parse(req.validatedParams); return ok(res, await connectionService.getIdentity(businessId, employeeId), "Employee GitHub identity retrieved"); }),
  setIdentity: asyncHandler(async (req: Request, res: Response) => { const { businessId, employeeId } = schemas.setEmployeeIdentitySchema.shape.params.parse(req.validatedParams); const { username } = schemas.setEmployeeIdentitySchema.shape.body.parse(req.validatedBody); return ok(res, await connectionService.setIdentity(businessId, employeeId, username, req.user!.id), "Employee GitHub identity updated"); }),
  removeIdentity: asyncHandler(async (req: Request, res: Response) => { const { businessId, employeeId } = schemas.employeeIdentitySchema.shape.params.parse(req.validatedParams); return ok(res, await connectionService.removeIdentity(businessId, employeeId, req.user!.id), "Employee GitHub identity removed"); }),
  getEmployeeAccess: asyncHandler(async (req: Request, res: Response) => { const { businessId, employeeId } = schemas.employeeIdentitySchema.shape.params.parse(req.validatedParams); return ok(res, { items: await externalAccessService.getEmployeeState(businessId, employeeId) }, "Employee external access state retrieved"); }),
});

export type GitHubIntegrationController = ReturnType<typeof createGitHubIntegrationController>;
