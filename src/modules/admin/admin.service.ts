import { prisma } from "../../lib/prisma";
import {
  Role,
  UserStatus,
  ParcelStatus,
  PaymentStatus,
} from "../../../generated/prisma";
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

  async getDashboardStats() {
    const [
      totalUsers,
      usersByRole,
      usersByStatus,
      totalParcels,
      parcelsByStatus,
      totalPayments,
      paymentsByStatus,
      revenueResult,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.groupBy({
        by: ["role"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),

      prisma.parcel.count({ where: { deletedAt: null } }),
      prisma.parcel.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),

      prisma.payment.count(),
      prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
    ]);

    const roleCount = (role: string) =>
      usersByRole.find((r) => r.role === role)?._count._all ?? 0;
    const statusCount = (status: string) =>
      usersByStatus.find((s) => s.status === status)?._count._all ?? 0;
    const parcelStatusCount = (status: ParcelStatus) =>
      parcelsByStatus.find((p) => p.status === status)?._count._all ?? 0;
    const paymentStatusCount = (status: PaymentStatus) =>
      paymentsByStatus.find((p) => p.status === status)?._count._all ?? 0;

    return {
      users: {
        total: totalUsers,
        customers: roleCount("CUSTOMER"),
        deliveryAgents: roleCount("DELIVERY_AGENT"),
        admins: roleCount("ADMIN"),
        active: statusCount("ACTIVE"),
        suspended: statusCount("SUSPENDED"),
      },
      parcels: {
        total: totalParcels,
        pending: parcelStatusCount("PENDING"),
        confirmed: parcelStatusCount("CONFIRMED"),
        assigned: parcelStatusCount("ASSIGNED"),
        pickedUp: parcelStatusCount("PICKED_UP"),
        inTransit: parcelStatusCount("IN_TRANSIT"),
        outForDelivery: parcelStatusCount("OUT_FOR_DELIVERY"),
        delivered: parcelStatusCount("DELIVERED"),
        failedDelivery: parcelStatusCount("FAILED_DELIVERY"),
        returned: parcelStatusCount("RETURNED"),
        cancelled: parcelStatusCount("CANCELLED"),
      },
      payments: {
        total: totalPayments,
        paid: paymentStatusCount("PAID"),
        pending: paymentStatusCount("PENDING"),
        failed: paymentStatusCount("FAILED"),
      },
      revenue: {
        total: Math.round((revenueResult._sum.amount ?? 0) * 100) / 100,
      },
    };
  },

  async getDashboardAnalytics(period: "7d" | "30d" | "90d" | "year" = "30d") {
    const PERIOD_DAYS: Record<string, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      year: 365,
    };
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - PERIOD_DAYS[period]);

    const [parcelsInPeriod, paidPaymentsInPeriod, statusGroups] =
      await Promise.all([
        prisma.parcel.findMany({
          where: { deletedAt: null, createdAt: { gte: startDate } },
          select: { createdAt: true },
        }),

        prisma.payment.findMany({
          where: { status: "PAID", updatedAt: { gte: startDate } },
          select: { amount: true, updatedAt: true },
        }),

        prisma.parcel.groupBy({
          by: ["status"],
          where: { deletedAt: null, createdAt: { gte: startDate } },
          _count: { _all: true },
        }),
      ]);

    const shipmentTrendMap = new Map<string, number>();
    for (const parcel of parcelsInPeriod) {
      const dateKey = parcel.createdAt.toISOString().slice(0, 10);
      shipmentTrendMap.set(dateKey, (shipmentTrendMap.get(dateKey) ?? 0) + 1);
    }

    const revenueTrendMap = new Map<string, number>();
    for (const payment of paidPaymentsInPeriod) {
      const dateKey = payment.updatedAt.toISOString().slice(0, 10);
      revenueTrendMap.set(
        dateKey,
        (revenueTrendMap.get(dateKey) ?? 0) + payment.amount,
      );
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const shipmentTrend = Array.from(shipmentTrendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const revenueTrend = Array.from(revenueTrendMap.entries())
      .map(([date, amount]) => ({ date, amount: round2(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const statusDistribution = statusGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
    }));

    return { shipmentTrend, revenueTrend, statusDistribution };
  },
};
