import { Router } from "express";
import { adminController } from "./admin.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { listUsersSchema, updateUserStatusSchema } from "./admin.validation";

const router = Router();

router.get(
  "/audit-logs",
  authenticate,
  authorize("ADMIN"),
  adminController.listAuditLogs,
);

router.get(
  "/users",
  authenticate,
  authorize("ADMIN"),
  validateRequest(listUsersSchema),
  adminController.listUsers,
);

router.patch(
  "/users/:id/status",
  authenticate,
  authorize("ADMIN"),
  validateRequest(updateUserStatusSchema),
  adminController.updateUserStatus,
);

export default router;
