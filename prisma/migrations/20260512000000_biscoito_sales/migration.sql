-- CreateEnum
CREATE TYPE "BiscoitoDiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "BiscoitoSaleStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "crm_BiscoitoSales" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "targetPriceId" TEXT NOT NULL,
    "stripeProductId" TEXT NOT NULL,
    "stripeProductName" TEXT,
    "stripePriceNickname" TEXT,
    "stripeUnitAmount" INTEGER,
    "stripeCouponId" TEXT NOT NULL,
    "stripePromotionCodeId" TEXT NOT NULL,
    "promoCode" TEXT NOT NULL,
    "discountType" "BiscoitoDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "BiscoitoSaleStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_BiscoitoSales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_StripeWebhookEvents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_StripeWebhookEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_BiscoitoSales_stripePromotionCodeId_key" ON "crm_BiscoitoSales"("stripePromotionCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_BiscoitoSales_promoCode_key" ON "crm_BiscoitoSales"("promoCode");

-- CreateIndex
CREATE INDEX "crm_BiscoitoSales_sellerId_idx" ON "crm_BiscoitoSales"("sellerId");

-- CreateIndex
CREATE INDEX "crm_BiscoitoSales_status_idx" ON "crm_BiscoitoSales"("status");

-- CreateIndex
CREATE INDEX "crm_BiscoitoSales_targetPriceId_idx" ON "crm_BiscoitoSales"("targetPriceId");

-- CreateIndex
CREATE INDEX "crm_BiscoitoSales_createdAt_idx" ON "crm_BiscoitoSales"("createdAt");

-- AddForeignKey
ALTER TABLE "crm_BiscoitoSales" ADD CONSTRAINT "crm_BiscoitoSales_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
