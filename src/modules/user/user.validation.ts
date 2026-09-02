import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().min(2, "Name must be at least 2 characters").optional(),
      phone: z.string().min(6, "Invalid phone number").optional(),
      defaultPickupAddress: z.string().optional(), // customer-only field
      vehicleType: z.string().optional(), // agent-only field
      licenseNumber: z.string().optional(), // agent-only field
      availability: z.enum(["AVAILABLE", "ON_DELIVERY", "OFFLINE"]).optional(), // agent-only field
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided to update",
    }),
});
