import { app } from "./app.js";
import { connectToDatabase } from "./config/db.js";
import { env } from "./config/env.js";

import { initIpLocationService } from "./services/ip-location.service.js";
import { employeeVerificationWorker } from "./modules/employee/employee-verification.module.js";
import { createEmailDeliveryWorker } from "./modules/email/email-delivery.worker.js";
import { emailWorker } from "./modules/email/email-delivery.module.js";
import { startPolicyReconciliationWorker } from "./queues/policy-reconciliation.worker.js";
import { registerNightlyPolicyReconciliation } from "./queues/policy-reconciliation.scheduler.js";

const PORT = Number(process.env.PORT);

const startServer = async () => {
  await connectToDatabase(env.MONGO_URI);
  await initIpLocationService();
  employeeVerificationWorker.start();
  emailWorker.start();
  startPolicyReconciliationWorker();
  await registerNightlyPolicyReconciliation();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
