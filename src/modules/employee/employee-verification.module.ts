import { env } from "../../config/env.js";
import { employeeListRepository } from "../employee-list/employee-list.repository.js";
import { paystackService } from "../paystack/paystack.module.js";
import { createEmployeeVerificationWorker } from "./employee-verification.worker.js";
import { employeeRepository } from "./employee.repository.js";

const employeeVerificationWorker = createEmployeeVerificationWorker({
  employeeRepository,
  employeeListRepository,
  paystackService,
  intervalMs: env.VERIFICATION_WORKER_INTERVAL_MS,
  maxAttempts: env.VERIFICATION_MAX_ATTEMPTS,
});

export { employeeVerificationWorker };
