-- CreateEnum
CREATE TYPE "AccessTier" AS ENUM ('listener', 'member');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'listener';

-- AlterTable
ALTER TABLE "room_sessions" ALTER COLUMN "normalized_nickname" DROP NOT NULL,
ALTER COLUMN "display_nickname" DROP NOT NULL;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "listener_chat_visible" BOOLEAN NOT NULL DEFAULT false;
