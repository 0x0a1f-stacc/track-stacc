import { z } from "zod";

export const addQueueItemSchema = z.object({
  youtubeUrl: z.string().min(8).max(300),
});
export const voteSchema = z.object({
  vote: z.union([z.literal(1), z.literal(-1)]),
});
export const rejectSchema = z.object({
  reason: z.string().max(300).optional(),
});
