-- CreateEnum
CREATE TYPE "ReviewVisibility" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewModerationState" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ReviewReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATEFUL_CONTENT', 'PERSONAL_INFORMATION', 'OFF_TOPIC', 'FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('PRODUCT_REVIEW', 'SELLER_RATING');

-- CreateEnum
CREATE TYPE "ReviewRevisionSource" AS ENUM ('SUBMISSION', 'CUSTOMER_EDIT');

-- CreateEnum
CREATE TYPE "ReviewModerationAction" AS ENUM ('SUBMITTED', 'EDITED', 'REPORTED', 'APPROVED', 'HIDDEN', 'REMOVED', 'RESTORED', 'WITHDRAWN', 'REPORT_DISMISSED');

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "seller_id" UUID,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(120),
    "body" VARCHAR(2000) NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "visibility" "ReviewVisibility" NOT NULL DEFAULT 'PUBLISHED',
    "moderation_state" "ReviewModerationState" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "edit_deadline" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_review_revisions" (
    "id" UUID NOT NULL,
    "product_review_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(120),
    "body" VARCHAR(2000) NOT NULL,
    "author_user_id" UUID NOT NULL,
    "source" "ReviewRevisionSource" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_review_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_ratings" (
    "id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(2000),
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "visibility" "ReviewVisibility" NOT NULL DEFAULT 'PUBLISHED',
    "moderation_state" "ReviewModerationState" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "edit_deadline" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_rating_revisions" (
    "id" UUID NOT NULL,
    "seller_rating_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(2000),
    "author_user_id" UUID NOT NULL,
    "source" "ReviewRevisionSource" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_rating_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" UUID NOT NULL,
    "product_review_id" UUID,
    "seller_rating_id" UUID,
    "reporter_user_id" UUID NOT NULL,
    "reason" "ReviewReportReason" NOT NULL,
    "details" VARCHAR(2000),
    "status" "ReviewReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_user_id" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_moderation_events" (
    "id" UUID NOT NULL,
    "target_type" "ReviewTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "action" "ReviewModerationAction" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "previous_visibility" "ReviewVisibility",
    "resulting_visibility" "ReviewVisibility",
    "previous_moderation_state" "ReviewModerationState",
    "resulting_moderation_state" "ReviewModerationState",
    "idempotency_key" VARCHAR(64),
    "request_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_moderation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rating_summaries" (
    "product_id" UUID NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "star_1_count" INTEGER NOT NULL DEFAULT 0,
    "star_2_count" INTEGER NOT NULL DEFAULT 0,
    "star_3_count" INTEGER NOT NULL DEFAULT 0,
    "star_4_count" INTEGER NOT NULL DEFAULT 0,
    "star_5_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "recalculated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_rating_summaries_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "seller_rating_summaries" (
    "seller_id" UUID NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "star_1_count" INTEGER NOT NULL DEFAULT 0,
    "star_2_count" INTEGER NOT NULL DEFAULT 0,
    "star_3_count" INTEGER NOT NULL DEFAULT 0,
    "star_4_count" INTEGER NOT NULL DEFAULT 0,
    "star_5_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "recalculated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_rating_summaries_pkey" PRIMARY KEY ("seller_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_order_item_id_key" ON "product_reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "product_reviews_product_id_visibility_created_at_idx" ON "product_reviews"("product_id", "visibility", "created_at");

-- CreateIndex
CREATE INDEX "product_reviews_seller_id_visibility_created_at_idx" ON "product_reviews"("seller_id", "visibility", "created_at");

-- CreateIndex
CREATE INDEX "product_reviews_moderation_state_idx" ON "product_reviews"("moderation_state");

-- CreateIndex
CREATE UNIQUE INDEX "product_review_revisions_product_review_id_revision_number_key" ON "product_review_revisions"("product_review_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "seller_ratings_seller_order_id_key" ON "seller_ratings"("seller_order_id");

-- CreateIndex
CREATE INDEX "seller_ratings_seller_id_visibility_created_at_idx" ON "seller_ratings"("seller_id", "visibility", "created_at");

-- CreateIndex
CREATE INDEX "seller_ratings_moderation_state_idx" ON "seller_ratings"("moderation_state");

-- CreateIndex
CREATE UNIQUE INDEX "seller_rating_revisions_seller_rating_id_revision_number_key" ON "seller_rating_revisions"("seller_rating_id", "revision_number");

-- CreateIndex
CREATE INDEX "review_reports_status_idx" ON "review_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "review_moderation_events_idempotency_key_key" ON "review_moderation_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "review_moderation_events_target_type_target_id_created_at_idx" ON "review_moderation_events"("target_type", "target_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_review_revisions" ADD CONSTRAINT "product_review_revisions_product_review_id_fkey" FOREIGN KEY ("product_review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ratings" ADD CONSTRAINT "seller_ratings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_rating_revisions" ADD CONSTRAINT "seller_rating_revisions_seller_rating_id_fkey" FOREIGN KEY ("seller_rating_id") REFERENCES "seller_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_product_review_id_fkey" FOREIGN KEY ("product_review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_seller_rating_id_fkey" FOREIGN KEY ("seller_rating_id") REFERENCES "seller_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rating_summaries" ADD CONSTRAINT "product_rating_summaries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_rating_summaries" ADD CONSTRAINT "seller_rating_summaries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-added constraints not expressible in the Prisma schema DSL (same
-- convention as FulfillmentLine's quantity CHECK constraints).

ALTER TABLE "product_reviews"
  ADD CONSTRAINT "product_reviews_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "product_reviews_body_length_check" CHECK (char_length("body") BETWEEN 10 AND 2000),
  ADD CONSTRAINT "product_reviews_title_length_check" CHECK ("title" IS NULL OR char_length("title") <= 120);

ALTER TABLE "product_review_revisions"
  ADD CONSTRAINT "product_review_revisions_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "product_review_revisions_body_length_check" CHECK (char_length("body") BETWEEN 10 AND 2000);

ALTER TABLE "seller_ratings"
  ADD CONSTRAINT "seller_ratings_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "seller_ratings_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 2000);

ALTER TABLE "seller_rating_revisions"
  ADD CONSTRAINT "seller_rating_revisions_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "seller_rating_revisions_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 2000);

-- Report-target XOR: exactly one of productReviewId/sellerRatingId is set.
ALTER TABLE "review_reports"
  ADD CONSTRAINT "review_reports_target_xor_check" CHECK (
    ("product_review_id" IS NOT NULL AND "seller_rating_id" IS NULL)
    OR ("product_review_id" IS NULL AND "seller_rating_id" IS NOT NULL)
  );

-- details is required when reason = 'OTHER'.
ALTER TABLE "review_reports"
  ADD CONSTRAINT "review_reports_other_reason_details_check" CHECK (
    "reason" != 'OTHER' OR ("details" IS NOT NULL AND char_length("details") > 0)
  );

-- Report deduplication: at most one report per reporter per target. A plain
-- compound unique index would not work here since Postgres treats every
-- NULL column as distinct, so it would never reject a second report against
-- the same target (the other target column is always null).
CREATE UNIQUE INDEX "review_reports_product_reporter_key"
  ON "review_reports"("reporter_user_id", "product_review_id")
  WHERE "product_review_id" IS NOT NULL;

CREATE UNIQUE INDEX "review_reports_seller_reporter_key"
  ON "review_reports"("reporter_user_id", "seller_rating_id")
  WHERE "seller_rating_id" IS NOT NULL;

-- Rating-summary star counts must sum to ratingCount and be internally
-- consistent with ratingSum, catching an arithmetic bug in the recalculation
-- code at the database boundary rather than silently drifting.
ALTER TABLE "product_rating_summaries"
  ADD CONSTRAINT "product_rating_summaries_counts_consistent_check" CHECK (
    "rating_count" = "star_1_count" + "star_2_count" + "star_3_count" + "star_4_count" + "star_5_count"
    AND "rating_sum" = "star_1_count" + 2 * "star_2_count" + 3 * "star_3_count" + 4 * "star_4_count" + 5 * "star_5_count"
  );

ALTER TABLE "seller_rating_summaries"
  ADD CONSTRAINT "seller_rating_summaries_counts_consistent_check" CHECK (
    "rating_count" = "star_1_count" + "star_2_count" + "star_3_count" + "star_4_count" + "star_5_count"
    AND "rating_sum" = "star_1_count" + 2 * "star_2_count" + 3 * "star_3_count" + 4 * "star_4_count" + 5 * "star_5_count"
  );
