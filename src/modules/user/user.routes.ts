import { Router } from "express";
import { userController } from "./user.controller";
import { authenticate } from "../../middlewares/authenticate";
import { validateRequest } from "../../middlewares/validateRequest";
import { updateProfileSchema } from "./user.validation";

const router = Router();

router.get("/me", authenticate, userController.getMe);
router.patch(
  "/me",
  authenticate,
  validateRequest(updateProfileSchema),
  userController.updateMe,
);

export default router;
