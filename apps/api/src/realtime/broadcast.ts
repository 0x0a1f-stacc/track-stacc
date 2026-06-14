import type { ServerEvent } from "@trackstacc/types";
import type { Server } from "socket.io";

export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

export function broadcast(io: Server, roomId: string, event: ServerEvent) {
  io.to(roomChannel(roomId)).emit(event.type, event);
}
