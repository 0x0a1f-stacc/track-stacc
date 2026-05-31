-- CreateEnum
CREATE TYPE "NicknameClaimStatus" AS ENUM ('active', 'locked', 'released');

-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('private_link', 'public', 'password_protected');

-- CreateEnum
CREATE TYPE "PlaylistMechanic" AS ENUM ('fifo', 'voting', 'dj_rotation', 'host_curated', 'suggestions');

-- CreateEnum
CREATE TYPE "DuplicatePolicy" AS ENUM ('allow', 'block_queue', 'block_recent', 'block_session');

-- CreateEnum
CREATE TYPE "SkipVoteThresholdType" AS ENUM ('percentage', 'fixed_count');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('participant', 'moderator', 'host');

-- CreateEnum
CREATE TYPE "TrackProvider" AS ENUM ('youtube');

-- CreateEnum
CREATE TYPE "MetadataStatus" AS ENUM ('complete', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "QueueItemStatus" AS ENUM ('suggested', 'queued', 'playing', 'played', 'skipped', 'removed', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('user', 'system', 'moderation', 'song');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('mute', 'unmute', 'ban', 'unban', 'delete_message', 'remove_queue_item', 'force_skip');

-- CreateTable
CREATE TABLE "nickname_claims" (
    "id" UUID NOT NULL,
    "normalized_nickname" TEXT NOT NULL,
    "display_nickname" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "status" "NicknameClaimStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "nickname_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "RoomVisibility" NOT NULL DEFAULT 'private_link',
    "room_password_hash" TEXT,
    "host_secret_hash" TEXT NOT NULL,
    "playlist_mechanic" "PlaylistMechanic" NOT NULL DEFAULT 'fifo',
    "max_song_duration_seconds" INTEGER NOT NULL DEFAULT 600,
    "duplicate_policy" "DuplicatePolicy" NOT NULL DEFAULT 'block_queue',
    "skip_vote_threshold_type" "SkipVoteThresholdType" NOT NULL DEFAULT 'percentage',
    "skip_vote_threshold_value" INTEGER NOT NULL DEFAULT 50,
    "queue_locked" BOOLEAN NOT NULL DEFAULT false,
    "chat_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_sessions" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "nickname_claim_id" UUID,
    "normalized_nickname" TEXT NOT NULL,
    "display_nickname" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'participant',
    "session_token_hash" TEXT NOT NULL,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,

    CONSTRAINT "room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL,
    "provider" "TrackProvider" NOT NULL DEFAULT 'youtube',
    "provider_video_id" TEXT NOT NULL,
    "title" TEXT,
    "channel_title" TEXT,
    "thumbnail_url" TEXT,
    "duration_seconds" INTEGER,
    "is_embeddable" BOOLEAN,
    "metadata_status" "MetadataStatus" NOT NULL DEFAULT 'partial',
    "metadata_fetched_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_items" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "added_by_session_id" UUID,
    "status" "QueueItemStatus" NOT NULL DEFAULT 'queued',
    "position" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "mechanic_context" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_votes" (
    "id" UUID NOT NULL,
    "queue_item_id" UUID NOT NULL,
    "room_session_id" UUID NOT NULL,
    "vote" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "queue_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skip_votes" (
    "id" UUID NOT NULL,
    "queue_item_id" UUID NOT NULL,
    "room_session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skip_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "sender_session_id" UUID,
    "message_type" "ChatMessageType" NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMPTZ,
    "deleted_by_session_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_moderation_actions" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "actor_session_id" UUID,
    "target_session_id" UUID,
    "action_type" "ModerationActionType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_settings_history" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "actor_session_id" UUID,
    "setting_key" TEXT NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nickname_claims_normalized_nickname_status_key" ON "nickname_claims"("normalized_nickname", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_slug_key" ON "rooms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "room_sessions_session_token_hash_key" ON "room_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "room_sessions_room_id_last_seen_at_idx" ON "room_sessions"("room_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "room_sessions_room_id_normalized_nickname_left_at_key" ON "room_sessions"("room_id", "normalized_nickname", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_provider_provider_video_id_key" ON "tracks"("provider", "provider_video_id");

-- CreateIndex
CREATE INDEX "queue_items_room_id_status_position_created_at_idx" ON "queue_items"("room_id", "status", "position", "created_at");

-- CreateIndex
CREATE INDEX "queue_items_added_by_session_id_created_at_idx" ON "queue_items"("added_by_session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "queue_votes_queue_item_id_room_session_id_key" ON "queue_votes"("queue_item_id", "room_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "skip_votes_queue_item_id_room_session_id_key" ON "skip_votes"("queue_item_id", "room_session_id");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_created_at_idx" ON "chat_messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "room_moderation_actions_room_id_created_at_idx" ON "room_moderation_actions"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "room_settings_history_room_id_created_at_idx" ON "room_settings_history"("room_id", "created_at");

-- AddForeignKey
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_nickname_claim_id_fkey" FOREIGN KEY ("nickname_claim_id") REFERENCES "nickname_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_added_by_session_id_fkey" FOREIGN KEY ("added_by_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_room_session_id_fkey" FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skip_votes" ADD CONSTRAINT "skip_votes_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skip_votes" ADD CONSTRAINT "skip_votes_room_session_id_fkey" FOREIGN KEY ("room_session_id") REFERENCES "room_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_session_id_fkey" FOREIGN KEY ("sender_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_session_id_fkey" FOREIGN KEY ("deleted_by_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_actor_session_id_fkey" FOREIGN KEY ("actor_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_target_session_id_fkey" FOREIGN KEY ("target_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_settings_history" ADD CONSTRAINT "room_settings_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_settings_history" ADD CONSTRAINT "room_settings_history_actor_session_id_fkey" FOREIGN KEY ("actor_session_id") REFERENCES "room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
