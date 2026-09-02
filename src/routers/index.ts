import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/user/user.routes";
import parcelRoutes from "../modules/parcel/prarcel.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/parcels", parcelRoutes);

export default router;
