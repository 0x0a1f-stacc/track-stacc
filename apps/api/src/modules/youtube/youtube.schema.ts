import { z } from "zod";

export const youtubeUrlSchema = z.object({
  youtubeUrl: z.string().min(8).max(300),
});
