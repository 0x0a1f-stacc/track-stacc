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

export async function syncListenerChatChannelMembership(
  io: Server,
  roomId: string,
  listenerChatVisible: boolean,
) {
  const globalChannel = roomChannel(roomId);
  const chatChannel = roomChatChannel(roomId);

  const sockets = await io.in(globalChannel).fetchSockets();

  for (const socket of sockets) {
    const data = socket.data as { accessTier?: string };
    if (data.accessTier === "listener") {
      if (listenerChatVisible) {
        socket.join(chatChannel);
      } else {
        socket.leave(chatChannel);
      }
    }
  }
}

