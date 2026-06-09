import { z } from "zod";

export const listenRoomSchema = z.object({
  roomPassword: z.string().min(1).max(200).optional(),
});
