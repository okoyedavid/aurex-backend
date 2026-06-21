import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handle.middleware.js";
import { mongoSanitizeMiddleware } from "./middleware/mongo-sanitize.middleware.js";
import { notFound } from "./middleware/not-found.middleware.js";
import { globalLimiter } from "./middleware/rate-limit.middleware.js";
import { requestContext } from "./middleware/request-context.middleware.js";
import { healthRouter } from "./modules/health/health.route.js";
import { statusRouter } from "./modules/health/status.route.js";
import { authRouter } from "./modules/auth/auth.route.js";

const app = express();

app.set("trust proxy", 1);

app.use(requestContext);

app.use(
  cors({
    origin: env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

app.use(globalLimiter);

app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(mongoSanitizeMiddleware);

app.get("/", (_req, res) => {
  res.json({
    message: "Backend API is running.",
  });
});

app.use("/api/health", healthRouter);
app.use("/status", statusRouter);
app.use("/api/auth", authRouter);

app.use(notFound);
app.use(errorHandler);
export { app };
