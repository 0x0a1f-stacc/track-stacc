"use client";

import * as React from "react";
import type { ClientEvent, ServerEvent } from "@trackstacc/types";
import { createSocket, type TypedSocket } from "@/lib/socket";
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

export function useSocket(token: string | null) {
  const applyEvent = useRoomStore((state) => state.applyEvent);
  const [socket, setSocket] = React.useState<TypedSocket | null>(null);
  React.useEffect(() => {
    if (!token) return undefined;
    const next = createSocket(token);
    for (const type of serverTypes) next.on(type, (event) => applyEvent(event));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(next);
    return () => {
      next.disconnect();
    };
  }, [applyEvent, token]);
  return {
    emit: (event: ClientEvent) => {
      socket?.emit(event.type, event);
    },
    socket,
  };
}
