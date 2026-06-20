import type { Request, Response } from "express";
import type { HealthService } from "./health.service.js";

type HealthControllerDependencies = {
  healthService: HealthService;
};

const createHealthController = ({
  healthService,
}: HealthControllerDependencies) => {
  const getHealth = (_req: Request, res: Response) => {
    const payload = healthService.getSystemStatusPayload();

    return res
      .status(healthService.getHttpStatusForSystemState(payload.status))
      .json(payload);
  };

  const getStatusPage = (_req: Request, res: Response) => {
    const payload = healthService.getSystemStatusPayload();

    return res
      .status(healthService.getHttpStatusForSystemState(payload.status))
      .type("html")
      .send(healthService.renderStatusHtml(payload));
  };

  return { getHealth, getStatusPage };
};

export { createHealthController };
export type HealthController = ReturnType<typeof createHealthController>;
