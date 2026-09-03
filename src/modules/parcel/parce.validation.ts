import { z } from "zod";

export const createParcelSchema = z.object({
  body: z.object({
    senderName: z.string().min(2),
    senderPhone: z.string().min(6),
    receiverName: z.string().min(2),
    receiverPhone: z.string().min(6),
    pickupAddress: z.string().min(5),
    pickupCity: z.string().min(2),
    deliveryAddress: z.string().min(5),
    deliveryCity: z.string().min(2),
    parcelType: z.enum([
      "DOCUMENT",
      "PACKAGE",
      "FRAGILE",
      "ELECTRONICS",
      "OTHER",
    ]),
    weightKg: z.number().positive("Weight must be greater than 0"),
    serviceType: z.enum(["STANDARD", "EXPRESS"]),
    notes: z.string().optional(),
  }),
});

export const listParcelsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    status: z
      .enum([
        "PENDING",
        "CONFIRMED",
        "ASSIGNED",
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "FAILED_DELIVERY",
        "RETURNED",
      ])
      .optional(),
    sortBy: z.enum(["createdAt", "deliveryCharge"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    q: z.string().min(1).optional(),
  }),
});

export const parcelIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid parcel ID"),
  }),
});

export const updateStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid parcel ID"),
  }),
  body: z.object({
    status: z.enum([
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FAILED_DELIVERY",
      "RETURNED",
    ]),
    note: z.string().optional(),
  }),
});
