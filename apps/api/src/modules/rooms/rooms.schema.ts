import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  playlistMechanic: z
    .enum(["fifo", "voting", "dj_rotation", "host_curated", "suggestions"])
    .default("fifo"),
  visibility: z
    .enum(["private_link", "public", "password_protected"])
    .default("private_link"),
  maxSongDurationSeconds: z.number().int().min(30).max(7200).default(600),
  duplicatePolicy: z
    .enum(["allow", "block_queue", "block_recent", "block_session"])
    .default("block_queue"),
  roomPassword: z.string().min(10).max(200).optional(),
});

export const settingsSchema = z.object({
  settings: z.object({
    visibility: z
      .enum(["private_link", "public", "password_protected"])
      .optional(),
    maxSongDurationSeconds: z.number().int().min(30).max(7200).optional(),
    duplicatePolicy: z
      .enum(["allow", "block_queue", "block_recent", "block_session"])
      .optional(),
    skipVoteThresholdType: z.enum(["percentage", "fixed_count"]).optional(),
    skipVoteThresholdValue: z.number().int().min(1).max(100).optional(),
    queueLocked: z.boolean().optional(),
    chatLocked: z.boolean().optional(),
  }),
});

export const passwordVerifySchema = z.object({
  roomPassword: z.string().min(1).max(200),
});
