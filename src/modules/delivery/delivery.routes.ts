import { Router } from "express";
import { deliveryController } from "./delivery.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { assignAgentSchema, deliveryActionSchema } from "./delivery.validation";

const router = Router();

router.patch(
  "/:parcelId/assign",
  authenticate,
  authorize("ADMIN"),
  validateRequest(assignAgentSchema),
  deliveryController.assign,
);

router.patch(
  "/:parcelId/accept",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(deliveryActionSchema),
  deliveryController.accept,
);

router.patch(
  "/:parcelId/reject",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(deliveryActionSchema),
  deliveryController.reject,
);

router.patch(
  "/:parcelId/pickup",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(deliveryActionSchema),
  deliveryController.pickup,
);

export default router;
