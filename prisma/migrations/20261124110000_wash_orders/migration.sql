-- Carpet & curtain washing. Additive only: new tables, a new role value, and nullable links on Payment/OrderPhoto.
-- CreateEnum
CREATE TYPE "WashStatus" AS ENUM ('created', 'courier_assigned', 'measured', 'quote_sent', 'client_confirmed', 'picked_up', 'at_washer', 'washed', 'out_for_delivery', 'delivered_paid', 'closed', 'cancelled');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'washer';

-- AlterTable
ALTER TABLE "OrderPhoto" ADD COLUMN     "washOrderId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "washOrderId" TEXT;

-- CreateTable
CREATE TABLE "WashSettings" (
    "id" SERIAL NOT NULL,
    "service" "ServiceCode" NOT NULL,
    "pricePerM2" INTEGER NOT NULL,
    "washerSharePerM2" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL,
    "maxOrder" INTEGER NOT NULL,
    "maxItems" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL,
    "freeDeliveryFrom" INTEGER NOT NULL,
    "tolerancePct" DOUBLE PRECISION NOT NULL,
    "courierPay" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WashSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "service" "ServiceCode" NOT NULL,
    "customerId" INTEGER NOT NULL,
    "cityId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "pickupDate" TEXT NOT NULL,
    "slotId" INTEGER NOT NULL,
    "status" "WashStatus" NOT NULL DEFAULT 'created',
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settingsId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "courierId" INTEGER,
    "washerId" INTEGER,
    "quoteVersion" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER,
    "total" INTEGER,
    "deliveryFee" INTEGER,
    "washerPayout" INTEGER,
    "courierPay" INTEGER,
    "waiveDelivery" BOOLEAN NOT NULL DEFAULT false,
    "waiveReason" TEXT,
    "needsApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "paymentMethod" "PaymentMethod",
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "cashCollected" INTEGER,
    "cashHandoverId" INTEGER,
    "cancelReason" TEXT,
    "cancelledBy" TEXT,
    "alertedStuckAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WashOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "ServiceCode" NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "areaTenths" INTEGER NOT NULL,
    "washerLengthCm" INTEGER,
    "washerWidthCm" INTEGER,
    "washerAreaTenths" INTEGER,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WashItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashQuote" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL,
    "washerPayout" INTEGER NOT NULL,
    "minimumApplied" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "WashQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WashStatusLog" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "from" "WashStatus",
    "to" "WashStatus" NOT NULL,
    "actorId" INTEGER,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WashStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WashSettings_service_createdAt_idx" ON "WashSettings"("service", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WashOrder_number_key" ON "WashOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WashOrder_idempotencyKey_key" ON "WashOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WashOrder_status_cityId_idx" ON "WashOrder"("status", "cityId");

-- CreateIndex
CREATE INDEX "WashOrder_customerId_createdAt_idx" ON "WashOrder"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "WashOrder_courierId_status_idx" ON "WashOrder"("courierId", "status");

-- CreateIndex
CREATE INDEX "WashOrder_washerId_status_idx" ON "WashOrder"("washerId", "status");

-- CreateIndex
CREATE INDEX "WashOrder_service_createdAt_idx" ON "WashOrder"("service", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WashItem_label_key" ON "WashItem"("label");

-- CreateIndex
CREATE UNIQUE INDEX "WashItem_orderId_position_key" ON "WashItem"("orderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WashQuote_orderId_version_key" ON "WashQuote"("orderId", "version");

-- CreateIndex
CREATE INDEX "WashStatusLog_orderId_at_idx" ON "WashStatusLog"("orderId", "at");

-- CreateIndex
CREATE INDEX "OrderPhoto_washOrderId_idx" ON "OrderPhoto"("washOrderId");

-- CreateIndex
CREATE INDEX "Payment_washOrderId_idx" ON "Payment"("washOrderId");

-- AddForeignKey
ALTER TABLE "OrderPhoto" ADD CONSTRAINT "OrderPhoto_washOrderId_fkey" FOREIGN KEY ("washOrderId") REFERENCES "WashOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_washOrderId_fkey" FOREIGN KEY ("washOrderId") REFERENCES "WashOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_washerId_fkey" FOREIGN KEY ("washerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "WashSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashOrder" ADD CONSTRAINT "WashOrder_cashHandoverId_fkey" FOREIGN KEY ("cashHandoverId") REFERENCES "CashHandover"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashItem" ADD CONSTRAINT "WashItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WashOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashQuote" ADD CONSTRAINT "WashQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WashOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashStatusLog" ADD CONSTRAINT "WashStatusLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WashOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: starting price settings (the admin changes them later; every change is a new row).
INSERT INTO "WashSettings" ("service", "pricePerM2", "washerSharePerM2", "minOrder", "maxOrder", "maxItems", "deliveryFee", "freeDeliveryFrom", "tolerancePct", "courierPay")
VALUES ('carpet', 12000, 8000, 60000, 1500000, 10, 10000, 180000, 5, 0),
       ('curtain', 12000, 8000, 60000, 1500000, 10, 10000, 180000, 5, 0);
