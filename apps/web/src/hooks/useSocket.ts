"use client";

import type { ClientEvent, ServerEvent } from "@trackstacc/types";
import * as React from "react";

import { createSocket, type TypedSocket } from "@/lib/socket";
import { clearRoomCredentials } from "@/lib/storage";
import { useRoomStore } from "@/stores/room.store";

const serverTypes: ServerEvent["type"][] = [
  "room.snapshot",
  "presence.updated",
  "chat.message",
  "chat.deleted",
  "queue.updated",
  "queue.item.added",
  "queue.item.removed",
  "queue.vote.updated",
  "playback.state",
  "playback.resync",
  "room.settings.changed",
  "room.mechanic.changed",
  "moderation.applied",
  "error",
];

export function useSocket(token: string | null, roomSlug?: string) {
  const applyEvent = useRoomStore((state) => state.applyEvent);
  const [socket, setSocket] = React.useState<TypedSocket | null>(null);
  React.useEffect(() => {
    if (!token) return undefined;
    const next = createSocket(token);
    for (const type of serverTypes) next.on(type, (event) => applyEvent(event));
    next.on("connect_error", (err) => {
      const authErrors = [
        "invalid session",
        "Invalid websocket token.",
        "Websocket token expired.",
        "unauthorized",
      ];
      if (authErrors.includes(err.message)) {
        // Clear stale local credentials on authentication failure. This triggers 
        // the RoomShell's bootstrap useEffect to fallback to the /listen endpoint 
        // for same-session rehydration via the browser's session cookie.
        useRoomStore.getState().resetRoomState();
        if (roomSlug) {
          clearRoomCredentials(roomSlug);
        }
      }
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(next);
    return () => {
      next.disconnect();
    };
  }, [applyEvent, token, roomSlug]);
  return {
    emit: (event: ClientEvent) => {
      socket?.emit(event.type, event);
    },
    socket,
  };
}
