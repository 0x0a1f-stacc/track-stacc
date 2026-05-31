import { io, type Socket } from "socket.io-client";
import type { ClientEvent, ServerEvent } from "@trackstacc/types";

export type TypedSocket = Socket<
  Record<ServerEvent["type"], (event: ServerEvent) => void>,
  Record<ClientEvent["type"], (event: ClientEvent) => void>
>;

export function createSocket(token: string) {
  return io(process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000", {
    transports: ["websocket"],
    auth: { token },
  }) as TypedSocket;
}
