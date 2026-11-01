-- CreateTable
CREATE TABLE "staff_known_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_known_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_known_devices_token_hash_key" ON "staff_known_devices"("token_hash");

-- CreateIndex
CREATE INDEX "staff_known_devices_user_id_last_seen_at_idx" ON "staff_known_devices"("user_id", "last_seen_at");

-- AddForeignKey
ALTER TABLE "staff_known_devices" ADD CONSTRAINT "staff_known_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
