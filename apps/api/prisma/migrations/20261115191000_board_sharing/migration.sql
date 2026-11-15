-- AlterTable
ALTER TABLE "boards" ADD COLUMN "share_token" VARCHAR(64),
ADD COLUMN "share_role" "board_role" NOT NULL DEFAULT 'viewer';

-- CreateIndex
CREATE UNIQUE INDEX "boards_share_token_key" ON "boards"("share_token");
