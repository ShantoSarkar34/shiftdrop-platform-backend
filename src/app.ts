import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { catchAsync } from "./utils/catchAsync";
import { sendResponse } from "./utils/sendResponse";
import { prisma } from "./lib/prisma";
import { redisService } from "./lib/redisService";
import { env } from "./config/env";
import { notFound } from "./middlewares/notFound";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import v1Routes from "./routers/index";
import { paymentController } from "./modules/payment/payment.controller";

const app: Application = express();

app.use(cors());
app.use(cookieParser());

// Stripe webhook MUST receive the raw body — mounted BEFORE express.json()
app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentController.webhook
);

// Now safe to parse JSON for every other route
app.use(express.json());

app.get(
  "/",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, 200, { success: true, message: "SwiftDrop Server is running now!" });
  })
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
  })
);

app.use("/api/v1", v1Routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;