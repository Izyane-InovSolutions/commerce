-- CreateTable
CREATE TABLE "handoff_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handoff_tokens_token_hash_key" ON "handoff_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "handoff_tokens_user_id_idx" ON "handoff_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "handoff_tokens" ADD CONSTRAINT "handoff_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
