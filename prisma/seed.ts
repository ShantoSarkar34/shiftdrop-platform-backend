import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@swiftdrop.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const customerEmail =
    process.env.SEED_CUSTOMER_EMAIL ?? "customer@swiftdrop.com";
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "ChangeMe123!";
  const agentEmail = process.env.SEED_AGENT_EMAIL ?? "agent@swiftdrop.com";
  const agentPassword = process.env.SEED_AGENT_PASSWORD ?? "ChangeMe123!";

  // ---- Admin ----
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "SwiftDrop Admin",
      email: adminEmail,
      password: adminHash,
      role: "ADMIN",
      provider: "LOCAL",
      status: "ACTIVE",
    },
  });
  console.log(`✔ Admin ready: ${admin.email}`);

  // ---- Demo Customer ----
  const customerHash = await bcrypt.hash(customerPassword, 12);
  const customerUser = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      name: "Demo Customer",
      email: customerEmail,
      password: customerHash,
      role: "CUSTOMER",
      provider: "LOCAL",
      status: "ACTIVE",
      customer: {
        create: { defaultPickupAddress: "House 12, Road 5, Dhaka" },
      },
    },
  });
  console.log(`✔ Demo customer ready: ${customerUser.email}`);

  // ---- Demo Delivery Agent ----
  const agentHash = await bcrypt.hash(agentPassword, 12);
  const agentUser = await prisma.user.upsert({
    where: { email: agentEmail },
    update: {},
    create: {
      name: "Demo Delivery Agent",
      email: agentEmail,
      password: agentHash,
      role: "DELIVERY_AGENT",
      provider: "LOCAL",
      status: "ACTIVE",
      deliveryAgent: {
        create: {
          vehicleType: "Motorcycle",
          licenseNumber: "DHK-DEMO-001",
          availability: "AVAILABLE",
        },
      },
    },
  });
  console.log(`✔ Demo delivery agent ready: ${agentUser.email}`);

  console.log("\nSeed complete. Demo credentials:");
  console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Customer: ${customerEmail} / ${customerPassword}`);
  console.log(`  Agent:    ${agentEmail} / ${agentPassword}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
