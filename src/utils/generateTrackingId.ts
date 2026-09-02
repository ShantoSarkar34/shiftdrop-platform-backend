import crypto from "crypto";
import { prisma } from "../lib/prisma";

export const generateTrackingId = async (): Promise<string> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // e.g. 260902
    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. A1B2C3
    const trackingId = `SD${datePart}${randomPart}`;

    const existing = await prisma.parcel.findUnique({ where: { trackingId } });
    if (!existing) return trackingId;
  }

  throw new Error(
    "Failed to generate a unique tracking ID after multiple attempts",
  );
};
