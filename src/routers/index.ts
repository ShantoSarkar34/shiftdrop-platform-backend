import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/user/user.routes";
import parcelRoutes from "../modules/parcel/parcel.routes";
import deliveryRoutes from "../modules/delivery/delivery.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/parcels", parcelRoutes);
router.use("/deliveries", deliveryRoutes);

export default router;
