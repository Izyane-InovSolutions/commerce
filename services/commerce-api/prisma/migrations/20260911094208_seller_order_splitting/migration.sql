-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "seller_order_id" UUID;

-- CreateTable
CREATE TABLE "seller_orders" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_orders_seller_id_status_idx" ON "seller_orders"("seller_id", "status");

-- CreateIndex
CREATE INDEX "order_items_seller_order_id_idx" ON "order_items"("seller_order_id");

-- AddForeignKey
ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
