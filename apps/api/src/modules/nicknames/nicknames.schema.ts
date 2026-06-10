import { z } from "zod";

export const nicknameCheckSchema = z.object({
  displayNickname: z.string().min(1).max(80),
});
export const nicknameProtectSchema = z.object({
  displayNickname: z.string().min(1).max(80),
  password: z.string().min(10).max(200),
});
export const nicknameAuthSchema = nicknameProtectSchema;
export const joinRoomSchema = z.object({
  displayNickname: z.string().min(1).max(80).optional(),
  nicknamePassword: z.string().max(200).optional(),
  roomPassword: z.string().max(200).optional(),
  listenerSessionId: z.string().uuid().optional(),
});
