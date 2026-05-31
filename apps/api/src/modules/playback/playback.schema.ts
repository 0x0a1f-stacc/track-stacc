import { z } from "zod";

export const clientPlaybackStateSchema = z.object({
  status: z.string(),
  positionSeconds: z.number().min(0),
  queueItemId: z.string().uuid().optional(),
});
