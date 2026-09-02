import { Router } from "express";
import { paymentController } from "./payment.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { createCheckoutSchema } from "./payment.validation";

const router = Router();

router.post(
  "/:parcelId/checkout",
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

// Note: webhook route is NOT here — it's mounted separately in app.ts (see below)

export default router;
