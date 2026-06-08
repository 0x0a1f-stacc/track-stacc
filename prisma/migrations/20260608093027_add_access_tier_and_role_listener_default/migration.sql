-- AlterTable
ALTER TABLE "room_sessions" ADD COLUMN     "access_tier" "AccessTier" NOT NULL DEFAULT 'listener',
ALTER COLUMN "role" SET DEFAULT 'listener';
