-- CreateTable
CREATE TABLE "category_attributes" (
    "category_id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_attributes_pkey" PRIMARY KEY ("category_id","attribute_id")
);

-- CreateIndex
CREATE INDEX "category_attributes_attribute_id_idx" ON "category_attributes"("attribute_id");

-- AddForeignKey
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
