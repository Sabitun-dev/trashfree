-- Services and courier service permissions. Additive only: no existing table or row is changed in a breaking way.

-- CreateEnum
CREATE TYPE "ServiceCode" AS ENUM ('trash', 'carpet', 'curtain');

-- CreateTable
CREATE TABLE "Service" (
    "code" "ServiceCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "showWhenOff" BOOLEAN NOT NULL DEFAULT false,
    "offMessage" TEXT,
    "offUntil" TIMESTAMP(3),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CourierService" (
    "userId" INTEGER NOT NULL,
    "service" "ServiceCode" NOT NULL,
    CONSTRAINT "CourierService_pkey" PRIMARY KEY ("userId", "service")
);

-- AddForeignKey
ALTER TABLE "CourierService" ADD CONSTRAINT "CourierService_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: invites default to trash, as before
ALTER TABLE "Invite" ADD COLUMN "services" "ServiceCode"[] DEFAULT ARRAY['trash']::"ServiceCode"[];

-- Data: trash stays on exactly as today; the new services start OFF until the admin switches them on.
INSERT INTO "Service" ("code", "enabled", "sort") VALUES ('trash', true, 1), ('carpet', false, 2), ('curtain', false, 3)
ON CONFLICT ("code") DO NOTHING;

-- Data: every existing courier keeps handling trash, so nothing changes for them.
INSERT INTO "CourierService" ("userId", "service")
SELECT DISTINCT u."id", 'trash'::"ServiceCode" FROM "User" u
LEFT JOIN "CourierCity" cc ON cc."userId" = u."id"
WHERE u."role" = 'courier' OR cc."userId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Match the Prisma schema exactly (the default was only needed for the inserts above).
ALTER TABLE "Service" ALTER COLUMN "updatedAt" DROP DEFAULT;
