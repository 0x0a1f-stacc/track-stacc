import type { ServerEvent } from "@trackstacc/types";
import type { Server } from "socket.io";

export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

export function roomChatChannel(roomId: string) {
  return `room:${roomId}:chat`;
}

export function broadcast(io: Server, roomId: string, event: ServerEvent) {
  const targetChannel =
    event.type === "chat.message" || event.type === "chat.deleted"
      ? roomChatChannel(roomId)
      : roomChannel(roomId);

  io.to(targetChannel).emit(event.type, event);
}
