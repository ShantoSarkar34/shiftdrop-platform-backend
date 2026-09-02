import { prisma } from "../../lib/prisma";
import { ApiError } from "../../modules/auth/auth.service";
import { Role } from "../../../generated/prisma";

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  defaultPickupAddress?: string;
  vehicleType?: string;
  licenseNumber?: string;
  availability?: "AVAILABLE" | "ON_DELIVERY" | "OFFLINE";
}

export const userService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        provider: true,
        status: true,
        createdAt: true,
        customer: {
          select: { defaultPickupAddress: true },
        },
        deliveryAgent: {
          select: {
            vehicleType: true,
            licenseNumber: true,
            availability: true,
          },
        },
      },
    });

    if (!user) throw new ApiError(404, "User not found");
    return user;
  },

  async updateProfile(userId: string, role: Role, input: UpdateProfileInput) {
    const {
      name,
      phone,
      defaultPickupAddress,
      vehicleType,
      licenseNumber,
      availability,
    } = input;

    await prisma.$transaction(async (tx) => {
      if (name || phone) {
        await tx.user.update({
          where: { id: userId },
          data: { ...(name && { name }), ...(phone && { phone }) },
        });
      }

      if (role === "CUSTOMER" && defaultPickupAddress !== undefined) {
        await tx.customer.update({
          where: { userId },
          data: { defaultPickupAddress },
        });
      }

      if (role === "DELIVERY_AGENT") {
        const agentData: Record<string, unknown> = {};
        if (vehicleType !== undefined) agentData.vehicleType = vehicleType;
        if (licenseNumber !== undefined)
          agentData.licenseNumber = licenseNumber;
        if (availability !== undefined) agentData.availability = availability;

        if (Object.keys(agentData).length > 0) {
          await tx.deliveryAgent.update({
            where: { userId },
            data: agentData,
          });
        }
      }
    });

    return this.getProfile(userId);
  },
};
