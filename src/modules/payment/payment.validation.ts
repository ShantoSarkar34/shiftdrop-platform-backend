import { z } from "zod";

export const createCheckoutSchema = z.object({
  params: z.object({
    parcelId: z.string().uuid("Invalid parcel ID"),
  }),
});