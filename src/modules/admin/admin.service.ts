import { prisma } from "../../lib/prisma";
import { Role, UserStatus } from "../../../generated/prisma";
import { ApiError } from "../../modules/auth/auth.service";
import { logAudit } from "../../utils/auditLogger";

interface AuditLogFilters {
  action?: string;
  entityType?: string;
  actorId?: string;
}

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  provider: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { defaultPickupAddress: true } },
  deliveryAgent: {
    select: { vehicleType: true, licenseNumber: true, availability: true },
  },
} as const;

export const adminService = {
  async listAuditLogs(filters: AuditLogFilters, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.actorId) where.actorId = filters.actorId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async listUsers(
    filters: {
      role?: Role;
      status?: UserStatus;
      q?: string;
      sortBy?: "createdAt" | "name";
      sortOrder?: "asc" | "desc";
    },
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };

    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { email: { contains: filters.q, mode: "insensitive" } },
      ];
    }

    const orderBy = {
      [filters.sortBy ?? "createdAt"]: filters.sortOrder ?? "desc",
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: safeUserSelect,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async updateUserStatus(
    adminUserId: string,
    targetUserId: string,
    newStatus: UserStatus,
  ) {
    if (adminUserId === targetUserId) {
      throw new ApiError(
        400,
        "Admins cannot change their own account status through this endpoint",
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!targetUser) throw new ApiError(404, "User not found");

    if (targetUser.status === newStatus) {
      throw new ApiError(409, `User status is already ${newStatus}`);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { status: newStatus },
        select: safeUserSelect,
      });

      await logAudit(
        {
          actorId: adminUserId,
          action: "USER_STATUS_CHANGED",
          entityType: "User",
          entityId: targetUserId,
          metadata: { from: targetUser.status, to: newStatus },
        },
        tx,
      );

      return updated;
    });
  },
};
