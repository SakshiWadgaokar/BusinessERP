-- AlterTable
ALTER TABLE "dealer_orders" ADD COLUMN     "applied_offer_code" VARCHAR(40),
ADD COLUMN     "applied_offer_id" TEXT,
ADD COLUMN     "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "applied_offer_code" VARCHAR(40),
ADD COLUMN     "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promotional_offers" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "occasion" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "min_order_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "target_dealer_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotional_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotional_offers_code_key" ON "promotional_offers"("code");

-- CreateIndex
CREATE INDEX "promotional_offers_is_active_valid_from_valid_to_idx" ON "promotional_offers"("is_active", "valid_from", "valid_to");
