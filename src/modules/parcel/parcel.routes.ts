import { Router } from "express";
import { parcelController } from "./parcel.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validateRequest } from "../../middlewares/validateRequest";
import { createParcelSchema, listParcelsSchema, parcelIdParamSchema, updateStatusSchema } from "./parce.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  validateRequest(createParcelSchema),
  parcelController.create
);

router.get(
  "/",
  authenticate,
  validateRequest(listParcelsSchema),
  parcelController.list
);

router.get(
  "/:id",
  authenticate,
  validateRequest(parcelIdParamSchema),
  parcelController.getById
);

router.patch(
  "/:id/cancel",
  authenticate,
  authorize("CUSTOMER"),
  validateRequest(parcelIdParamSchema),
  parcelController.cancel
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("DELIVERY_AGENT", "ADMIN"),
  validateRequest(updateStatusSchema),
  parcelController.updateStatus
);

export default router;