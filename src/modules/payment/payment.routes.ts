import { Router } from "express";
import { paymentController } from "./payment.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { createCheckoutSchema, syncPaymentSchema } from "./payment.validation";
import { paymentLimiter } from "../../middlewares/rateLimiter";

const router = Router();

router.post(
  "/:parcelId/checkout",
  paymentLimiter,
  authenticate,
  authorize("CUSTOMER"),
  validateRequest(createCheckoutSchema),
  paymentController.createCheckout,
);

router.get(
  "/:parcelId",
  authenticate,
  authorize("CUSTOMER"),
  paymentController.getByParcel,
);

router.get(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  paymentController.listMine,
);

router.get(
  "/sync/:sessionId",
  authenticate,
  authorize("CUSTOMER"),
  validateRequest(syncPaymentSchema),
  paymentController.syncPayment,
);

export default router;
