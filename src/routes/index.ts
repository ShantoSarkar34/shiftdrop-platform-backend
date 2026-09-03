import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/user/user.routes";
import parcelRoutes from "../modules/parcel/parcel.routes";
import deliveryRoutes from "../modules/delivery/delivery.routes";
import paymentRoutes from "../modules/payment/payment.routes";
import adminRoutes from "../modules/admin/admin.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/parcels", parcelRoutes);
router.use("/deliveries", deliveryRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);

export default router;
