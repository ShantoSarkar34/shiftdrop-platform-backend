import { Router } from "express";
import { deliveryController } from "./delivery.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  assignAgentSchema,
  deliveryActionSchema,
  earningsQuerySchema,
  myDeliveriesSchema,
  updateAvailabilitySchema,
} from "./delivery.validation";

const router = Router();

router.get(
  "/my",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(myDeliveriesSchema),
  deliveryController.getMyDeliveries,
);

router.patch(
  "/availability",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(updateAvailabilitySchema),
  deliveryController.updateAvailability,
);

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

router.get(
  "/earnings",
  authenticate,
  authorize("DELIVERY_AGENT"),
  validateRequest(earningsQuerySchema),
  deliveryController.getEarnings,
);

export default router;
