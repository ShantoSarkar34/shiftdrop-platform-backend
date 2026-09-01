import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = global.__prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
