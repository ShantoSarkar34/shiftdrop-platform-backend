import { prisma } from "../../lib/prisma";
import { ApiError } from "../../modules/auth/auth.service";
import { generateTrackingId } from "../../utils/generateTrackingId";
import { calculateDeliveryCharge } from "./parcel.pricing";
import { ParcelStatus, Role } from "../../../generated/prisma";
import { isValidTransition } from "./parcel.stateMachine";

interface CreateParcelInput {
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  pickupAddress: string;
  pickupCity: string;
  deliveryAddress: string;
  deliveryCity: string;
  parcelType: "DOCUMENT" | "PACKAGE" | "FRAGILE" | "ELECTRONICS" | "OTHER";
  weightKg: number;
  serviceType: "STANDARD" | "EXPRESS";
  notes?: string;
}

export const parcelService = {
  async create(userId: string, input: CreateParcelInput) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const trackingId = await generateTrackingId();
    const deliveryCharge = calculateDeliveryCharge(
      input.serviceType,
      input.weightKg,
      input.pickupCity,
      input.deliveryCity,
    );

    return prisma.$transaction(async (tx) => {
      const parcel = await tx.parcel.create({
        data: {
          ...input,
          trackingId,
          deliveryCharge,
          customerId: customer.id,
          status: "PENDING",
        },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId: parcel.id,
          status: "PENDING",
          changedBy: userId,
          note: "Shipment created",
        },
      });

      return parcel;
    });
  },

  async list(userId: string, role: Role, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({ where: { userId } });
      if (!customer) throw new ApiError(404, "Customer profile not found");
      where.customerId = customer.id;
    } else if (role === "DELIVERY_AGENT") {
      const agent = await prisma.deliveryAgent.findUnique({
        where: { userId },
      });
      if (!agent) throw new ApiError(404, "Delivery agent profile not found");
      where.assignedAgentId = agent.id;
    }
    // ADMIN: no filter — sees all parcels

    const [parcels, total] = await Promise.all([
      prisma.parcel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.parcel.count({ where }),
    ]);

    return {
      parcels,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getById(userId: string, role: Role, parcelId: string) {
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
      include: { statusHistory: { orderBy: { createdAt: "asc" } } },
    });

    if (!parcel) throw new ApiError(404, "Parcel not found");

    if (role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({ where: { userId } });
      if (!customer || parcel.customerId !== customer.id) {
        throw new ApiError(403, "You do not have access to this shipment");
      }
    } else if (role === "DELIVERY_AGENT") {
      const agent = await prisma.deliveryAgent.findUnique({
        where: { userId },
      });
      if (!agent || parcel.assignedAgentId !== agent.id) {
        throw new ApiError(403, "You do not have access to this shipment");
      }
    }
    // ADMIN: no restriction

    return parcel;
  },

  async cancel(userId: string, parcelId: string) {
    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ApiError(404, "Customer profile not found");

    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
    });
    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (parcel.customerId !== customer.id) {
      throw new ApiError(403, "You do not have access to this shipment");
    }

    if (!["PENDING", "CONFIRMED"].includes(parcel.status)) {
      throw new ApiError(
        409,
        `Cannot cancel a shipment that is already ${parcel.status}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: "CANCELLED",
          changedBy: userId,
          note: "Cancelled by customer",
        },
      });

      return updated;
    });
  },

  async updateStatus(
    userId: string,
    role: Role,
    parcelId: string,
    newStatus: ParcelStatus,
    note?: string
  ) {
    const parcel = await prisma.parcel.findUnique({ where: { id: parcelId, deletedAt: null } });
    if (!parcel) throw new ApiError(404, "Parcel not found");

    if (role === "DELIVERY_AGENT") {
      const agent = await prisma.deliveryAgent.findUnique({ where: { userId } });
      if (!agent || parcel.assignedAgentId !== agent.id) {
        throw new ApiError(403, "This shipment is not assigned to you");
      }
    }
    // ADMIN: no ownership restriction

    if (!isValidTransition(parcel.status, newStatus)) {
      throw new ApiError(
        409,
        `Cannot transition from ${parcel.status} to ${newStatus}`
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: { status: newStatus },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: newStatus,
          changedBy: userId,
          note: note ?? `Status changed to ${newStatus}`,
        },
      });

      // If parcel reaches a terminal delivery-cycle state, free up the agent
      if (["DELIVERED", "RETURNED"].includes(newStatus) && parcel.assignedAgentId) {
        await tx.deliveryAgent.update({
          where: { id: parcel.assignedAgentId },
          data: { availability: "AVAILABLE" },
        });
      }

      return updated;
    });
  },
};
