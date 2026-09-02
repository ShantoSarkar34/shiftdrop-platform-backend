import { Router } from "express";
import { adminController } from "./admin.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";

const router = Router();

router.get(
  "/audit-logs",
  authenticate,
  authorize("ADMIN"),
  adminController.listAuditLogs,
);

export default router;
