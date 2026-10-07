import { z } from "zod";

export const createCheckoutSchema = z.object({
  params: z.object({
    parcelId: z.string().uuid("Invalid parcel ID"),
  }),
});

export const syncPaymentSchema = z.object({
  params: z.object({
    sessionId: z.string().min(1, "Session ID is required"),
  }),
});
