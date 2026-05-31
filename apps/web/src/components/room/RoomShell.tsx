"use client";

import * as React from "react";
import { useSocket } from "@/hooks/useSocket";
import { useRoomStore } from "@/stores/room.store";
import { AddSongInput } from "./AddSongInput";
import { ChatPanel } from "./ChatPanel";
import { ParticipantList } from "./ParticipantList";
import { PlaybackControls } from "./PlaybackControls";
import { QueuePanel } from "./QueuePanel";
import { RoomSettings } from "./RoomSettings";
import { YoutubePlayer } from "./YoutubePlayer";

export function RoomShell({ roomSlug }: { roomSlug: string }) {
  const token = useRoomStore((state) => state.websocketToken);
  const playback = useRoomStore((state) => state.playback);
  const room = useRoomStore((state) => state.room);
  const { emit } = useSocket(token);
  React.useEffect(() => {
    if (!token)
      useRoomStore
        .getState()
        .setToken(sessionStorage.getItem(`ws:${roomSlug}`) ?? "");
  }, [roomSlug, token]);
  return (
    <main className="grid min-h-screen gap-4 p-4 lg:grid-cols-[1.2fr_420px]">
      <section className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4">
          <h1 className="mb-3 text-2xl font-black">{room?.name ?? "Room"}</h1>
          <YoutubePlayer
            videoId={playback?.videoId}
            startSeconds={playback?.serverPositionSeconds ?? 0}
            emit={emit}
            {...(playback?.queueItemId
              ? { queueItemId: playback.queueItemId }
              : {})}
          />
          <PlaybackControls {...(room?.id ? { roomId: room.id } : {})} />
        </div>
        <AddSongInput {...(room?.id ? { roomId: room.id } : {})} emit={emit} />
        <QueuePanel />
        <RoomSettings />
      </section>
      <aside className="grid gap-4 lg:grid-rows-[1fr_260px]">
        <ChatPanel emit={emit} />
        <ParticipantList />
      </aside>
    </main>
  );
}
