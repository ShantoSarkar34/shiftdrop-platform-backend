import { Router } from "express";
import { authController } from "./auth.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { sendResponse } from "../../utils/sendResponse";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  googleLoginSchema,
} from "./auth.validation";
import { authLimiter } from "../../middlewares/rateLimiter";

const router = Router();

router.post(
  "/register",
  authLimiter,
  validateRequest(registerSchema),
  authController.register,
);
router.post(
  "/login",
  authLimiter,
  validateRequest(loginSchema),
  authController.login,
);
router.post(
  "/google",
  authLimiter,
  validateRequest(googleLoginSchema),
  authController.googleLogin,
);
router.post(
  "/refresh-token",
  authLimiter,
  validateRequest(refreshTokenSchema),
  authController.refresh,
);
router.post(
  "/logout",
  authLimiter,
  validateRequest(refreshTokenSchema),
  authController.logout,
);


router.get("/me", authLimiter, authenticate, (req, res) => {
  sendResponse(res, 200, {
    success: true,
    message: "Authenticated",
    data: req.user,
  });
});


router.get(
  "/admin-only",
  authLimiter,
  authenticate,
  authorize("ADMIN"),
  (req, res) => {
    sendResponse(res, 200, {
      success: true,
      message: "You are an admin",
      data: req.user,
    });
  },
);

export default router;
