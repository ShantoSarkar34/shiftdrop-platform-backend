import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { catchAsync } from "./utils/catchAsync";
import { sendResponse } from "./utils/sendResponse";
import { prisma } from "./lib/prisma";
import { redisService } from "./lib/redisService";
import { env } from "./config/env";
import { notFound } from "./middlewares/notFound";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { globalLimiter } from "./middlewares/rateLimiter";
import v1Routes from "./routes/index";
import { paymentController } from "./modules/payment/payment.controller";

const app: Application = express();

app.use(helmet());

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(globalLimiter);

app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentController.webhook,
);

app.use(express.json());

app.get(
  "/",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, 200, {
      success: true,
      message: "SwiftDrop Server is running now!",
    });
  }),
);

app.get(
  "/api/v1/health",
  catchAsync(async (req: Request, res: Response) => {
    await prisma.$queryRaw`SELECT 1`;
    const testKey = "health:check";
    await redisService.set(testKey, "ok", 30);
    const value = await redisService.get(testKey);
    const ttl = await redisService.ttl(testKey);
    await redisService.delete(testKey);

    sendResponse(res, 200, {
      success: true,
      message: "SwiftDrop API is healthy",
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        database: "connected",
        redis: value === "ok" ? "connected" : "unreachable",
        redisTtlSample: ttl,
      },
    });
  }),
);

app.use("/api/v1", v1Routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
