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
