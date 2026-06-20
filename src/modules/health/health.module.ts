import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { createHealthController } from "./health.controller.js";
import { createHealthService } from "./health.service.js";

export const healthService = createHealthService({
  getDatabaseReadyState: () => mongoose.connection.readyState,
  getEnvironment: () => env.NODE_ENV,
  getUptimeSeconds: () => process.uptime(),
  getVersion: () => env.RELEASE,
  getCurrentDate: () => new Date(),
});

export const healthController = createHealthController({
  healthService,
});
