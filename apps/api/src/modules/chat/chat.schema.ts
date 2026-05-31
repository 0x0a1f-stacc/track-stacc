import { z } from "zod";

export const chatSendSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  tempId: z.string().max(80).optional(),
});
