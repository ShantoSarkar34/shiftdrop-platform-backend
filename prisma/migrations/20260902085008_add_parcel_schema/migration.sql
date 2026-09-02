-- CreateEnum
CREATE TYPE "ParcelType" AS ENUM ('DOCUMENT', 'PACKAGE', 'FRAGILE', 'ELECTRONICS', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('STANDARD', 'EXPRESS');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED_DELIVERY', 'RETURNED');

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedAgentId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "receiverPhone" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupCity" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "parcelType" "ParcelType" NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "deliveryCharge" DOUBLE PRECISION NOT NULL,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_status_history" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "changedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parcels_trackingId_key" ON "parcels"("trackingId");

-- CreateIndex
CREATE INDEX "parcels_customerId_idx" ON "parcels"("customerId");

-- CreateIndex
CREATE INDEX "parcels_assignedAgentId_idx" ON "parcels"("assignedAgentId");

-- CreateIndex
CREATE INDEX "parcels_status_idx" ON "parcels"("status");

-- CreateIndex
CREATE INDEX "parcel_status_history_parcelId_idx" ON "parcel_status_history"("parcelId");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "delivery_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_status_history" ADD CONSTRAINT "parcel_status_history_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
