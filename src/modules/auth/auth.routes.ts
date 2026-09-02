import { Router } from "express";
import { authController } from "./auth.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "./auth.validation";

const router = Router();

router.post(
  "/register",
  validateRequest(registerSchema),
  authController.register,
);
router.post("/login", validateRequest(loginSchema), authController.login);
router.post(
  "/refresh-token",
  validateRequest(refreshTokenSchema),
  authController.refresh,
);
router.post(
  "/logout",
  validateRequest(refreshTokenSchema),
  authController.logout,
);

export default router;
