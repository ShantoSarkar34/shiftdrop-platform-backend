import { prisma } from "../../lib/prisma";
import { ApiError } from "../../modules/auth/auth.service";
import { logAudit } from "../../utils/auditLogger";

export const deliveryService = {
  async assignAgent(
    adminUserId: string,
    parcelId: string,
    agentUserId: string,
  ) {
    const [parcel, agent] = await Promise.all([
      prisma.parcel.findUnique({ where: { id: parcelId, deletedAt: null } }),
      prisma.deliveryAgent.findUnique({
        where: { userId: agentUserId },
        include: { user: true },
      }),
    ]);

    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (!agent) throw new ApiError(404, "Delivery agent not found");
    if (agent.user.status !== "ACTIVE" || agent.user.deletedAt) {
      throw new ApiError(400, "Delivery agent account is not active");
    }
    if (!["PENDING", "CONFIRMED"].includes(parcel.status)) {
      throw new ApiError(
        409,
        `Parcel is not in an assignable state (current: ${parcel.status})`,
      );
    }
    if (agent.availability !== "AVAILABLE") {
      throw new ApiError(409, "Delivery agent is not currently available");
    }

    return prisma.$transaction(async (tx) => {
      const agentClaim = await tx.deliveryAgent.updateMany({
        where: { id: agent.id, availability: "AVAILABLE" },
        data: { availability: "ON_DELIVERY" },
      });
      if (agentClaim.count === 0) {
        throw new ApiError(
          409,
          "Delivery agent was just assigned elsewhere, please retry",
        );
      }

      const parcelClaim = await tx.parcel.updateMany({
        where: { id: parcelId, status: parcel.status, assignedAgentId: null },
        data: { status: "ASSIGNED", assignedAgentId: agent.id },
      });
      if (parcelClaim.count === 0) {
        throw new ApiError(
          409,
          "Parcel was just modified elsewhere, please retry",
        );
      }

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: "ASSIGNED",
          changedBy: adminUserId,
          note: `Assigned to agent ${agent.user.name}`,
        },
      });

      await logAudit(
        {
          actorId: adminUserId,
          action: "SHIPMENT_ASSIGNED",
          entityType: "Parcel",
          entityId: parcelId,
          metadata: { agentId: agent.id, agentName: agent.user.name },
        },
        tx,
      );

      return tx.parcel.findUnique({ where: { id: parcelId } });
    });
  },

  async acceptAssignment(userId: string, parcelId: string) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { userId } });
    if (!agent) throw new ApiError(404, "Delivery agent profile not found");

    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
    });
    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (parcel.assignedAgentId !== agent.id) {
      throw new ApiError(403, "This shipment is not assigned to you");
    }
    if (parcel.status !== "ASSIGNED") {
      throw new ApiError(
        409,
        `Cannot accept a shipment with status ${parcel.status}`,
      );
    }

    await prisma.parcelStatusHistory.create({
      data: {
        parcelId,
        status: "ASSIGNED",
        changedBy: userId,
        note: "Assignment accepted by agent",
      },
    });

    return parcel;
  },

  async rejectAssignment(userId: string, parcelId: string) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { userId } });
    if (!agent) throw new ApiError(404, "Delivery agent profile not found");

    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
    });
    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (parcel.assignedAgentId !== agent.id) {
      throw new ApiError(403, "This shipment is not assigned to you");
    }
    if (parcel.status !== "ASSIGNED") {
      throw new ApiError(
        409,
        `Cannot reject a shipment with status ${parcel.status}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: { status: "CONFIRMED", assignedAgentId: null },
      });

      await tx.deliveryAgent.update({
        where: { id: agent.id },
        data: { availability: "AVAILABLE" },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: "CONFIRMED",
          changedBy: userId,
          note: "Assignment rejected by agent, returned to pool",
        },
      });

      return updated;
    });
  },

  async pickup(userId: string, parcelId: string) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { userId } });
    if (!agent) throw new ApiError(404, "Delivery agent profile not found");

    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId, deletedAt: null },
    });
    if (!parcel) throw new ApiError(404, "Parcel not found");
    if (parcel.assignedAgentId !== agent.id) {
      throw new ApiError(403, "This shipment is not assigned to you");
    }
    if (parcel.status !== "ASSIGNED") {
      throw new ApiError(
        409,
        `Cannot mark picked up from status ${parcel.status}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.parcel.update({
        where: { id: parcelId },
        data: { status: "PICKED_UP" },
      });

      await tx.parcelStatusHistory.create({
        data: {
          parcelId,
          status: "PICKED_UP",
          changedBy: userId,
          note: "Parcel picked up by agent",
        },
      });

      return updated;
    });
  },
};
