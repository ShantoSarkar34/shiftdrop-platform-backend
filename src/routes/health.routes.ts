import { Router } from "express";
import { sendSuccess } from "../utils/apiResponse";

const router = Router();

router.get("/", (req, res) => {
  sendSuccess(
    res,
    { uptime: process.uptime(), timestamp: new Date().toISOString() },
    "SwiftDrop API is healthy",
  );
});

export default router;
