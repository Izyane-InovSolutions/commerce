-- Public catalog search (ProductsService.buildPublicWhere) matches every term
-- with Prisma `contains` + `mode: 'insensitive'`, which Postgres runs as
-- ILIKE '%term%'. A leading wildcard can never use a btree index, so without
-- these every search was a sequential scan of each table below.
--
-- pg_trgm's GIN operator class indexes three-character substrings, which
-- lets the planner answer ILIKE '%term%' from the index for terms of three
-- or more characters (shorter terms still work, via a full index scan).
-- The indexes are also declared in schema.prisma so `prisma migrate dev`
-- does not see them as drift and try to drop them.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_description_trgm_idx" ON "products" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_variants_sku_code_trgm_idx" ON "product_variants" USING GIN ("sku_code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "categories_name_trgm_idx" ON "categories" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "sellers_display_name_trgm_idx" ON "sellers" USING GIN ("display_name" gin_trgm_ops);
