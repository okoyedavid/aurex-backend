import { Router } from "express";
import { healthController } from "./health.module.js";

const statusRouter = Router();

statusRouter.get("/", healthController.getStatusPage);

export { statusRouter };
