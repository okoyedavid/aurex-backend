import { Router } from "express";
import { healthController } from "./health.module.js";

const healthRouter = Router();

healthRouter.get("/", healthController.getHealth);

export { healthRouter };
