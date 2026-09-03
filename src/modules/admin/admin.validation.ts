import { z } from "zod";

export const listUsersSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    role: z.enum(["CUSTOMER", "DELIVERY_AGENT", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    q: z.string().min(1).optional(),
    sortBy: z.enum(["createdAt", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});

export const updateUserStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid user ID"),
  }),
  body: z.object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  }),
});
