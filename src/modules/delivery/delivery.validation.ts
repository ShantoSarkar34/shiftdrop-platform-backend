import { z } from "zod";

export const assignAgentSchema = z.object({
  params: z.object({
    parcelId: z.string().uuid("Invalid parcel ID"),
  }),
  body: z.object({
    agentId: z.string().uuid("Invalid agent user ID"),
  }),
});

export const deliveryActionSchema = z.object({
  params: z.object({
    parcelId: z.string().uuid("Invalid parcel ID"),
  }),
});

export const myDeliveriesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    status: z
      .enum([
        "ASSIGNED",
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "FAILED_DELIVERY",
        "RETURNED",
      ])
      .optional(),
  }),
});
