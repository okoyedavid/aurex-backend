import { env } from "../../config/env.js";
import { createHttpError } from "../../utils/api-error.js";
import { policyResolver } from "../policy/policy.module.js";
import { createWarpDemoController } from "./warp-demo.controller.js";
import { warpDemoRepository } from "./warp-demo.repository.js";
import { createWarpDemoService } from "./warp-demo.service.js";

export const warpDemoService = createWarpDemoService({ repository: warpDemoRepository, resolver: policyResolver, businessId: env.WARP_DEMO_BUSINESS_ID, createHttpError });
export const warpDemoController = createWarpDemoController(warpDemoService);
