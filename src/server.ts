import { app } from "./app.js";
import { connectToDatabase } from "./config/db.js";
import { env } from "./config/env.js";

import { initIpLocationService } from "./services/ip-location.service.js";

const PORT = Number(process.env.PORT);

const startServer = async () => {
  await connectToDatabase(env.MONGO_URI);
  await initIpLocationService();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
