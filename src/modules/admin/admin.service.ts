import { prisma } from "../../lib/prisma";

interface AuditLogFilters {
  action?: string;
  entityType?: string;
  actorId?: string;
}

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
};
