import { Prisma, PrismaClient } from "../../generated/prisma";
import { prisma } from "../lib/prisma";

type TxClient = Prisma.TransactionClient;

interface LogAuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

export const logAudit = async (
  input: LogAuditInput,
  client: PrismaClient | TxClient = prisma,
) => {
  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
};
