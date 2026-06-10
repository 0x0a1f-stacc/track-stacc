"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { AccessTier, QueueItemStatus } from "@trackstacc/types";
import { useSocket } from "@/hooks/useSocket";
import { useRoomStore } from "@/stores/room.store";
import { api } from "@/lib/api";
import { AddSongInput } from "./AddSongInput";
import { ChatPanel } from "./ChatPanel";
import { ListenerUpgradePrompt } from "./ListenerUpgradePrompt";
import { ParticipantList } from "./ParticipantList";
import { PlaybackControls } from "./PlaybackControls";
import { QueuePanel } from "./QueuePanel";
import { RoomSettings } from "./RoomSettings";
import { YoutubePlayer } from "./YoutubePlayer";

type ListenerState =
  | { status: "listening" }
  | { status: "error"; message: string }
  | { status: "password-required" }
  | { status: "ok" };

export function RoomShell({ roomSlug }: { roomSlug: string }) {
  const router = useRouter();
  const token = useRoomStore((state) => state.websocketToken);
  const ownAccessTier = useRoomStore((state) => state.ownAccessTier);
  const playback = useRoomStore((state) => state.playback);
  const room = useRoomStore((state) => state.room);
  const queue = useRoomStore((state) => state.queue);
  const { emit } = useSocket(token);
  const [listenerState, setListenerState] = React.useState<ListenerState | null>(null);
  React.useEffect(() => {
    if (token) return;
    const stored =
      sessionStorage.getItem(`ws:${roomSlug}`) ??
      localStorage.getItem(`ws:${roomSlug}`);
    if (stored) {
      useRoomStore.getState().setToken(stored);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListenerState({ status: "listening" });
    api
      .listenRoom(roomSlug)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      .then((response) => {
        useRoomStore.getState().setToken(response.websocketToken);
        useRoomStore
          .getState()
          .setOwnAccessTier(response.session.accessTier as AccessTier);
        sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
        setListenerState({ status: "ok" });
      })
      .catch((caught: unknown) => {
        const msg =
          caught instanceof Error ? caught.message : "Failed to open room";
        if (msg.includes("ROOM_PASSWORD_REQUIRED")) {
          setListenerState({ status: "password-required" });
        } else if (msg.includes("ROOM_NOT_FOUND")) {
          setListenerState({ status: "error", message: "Room not found." });
        } else {
          setListenerState({
            status: "error",
            message: "Could not open room. Try again?",
          });
        }
      });
  }, [roomSlug, token]);
  React.useEffect(() => {
    if (
      listenerState?.status === "password-required"
    ) {
      router.replace(`/rooms/${roomSlug}/join`);
    }
  }, [listenerState, roomSlug, router]);

  const nextQueuedItem = React.useMemo(() => {
    return queue.find(
      (item) => item.status === QueueItemStatus.Queued && item.track.provider === "youtube",
    );
  }, [queue]);
  const nextVideoId = nextQueuedItem?.track.videoId ?? null;

  if (
    listenerState?.status === "listening"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400">Opening room…</p>
      </main>
    );
  }

  if (listenerState?.status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">{listenerState.message}</p>
        <button
          type="button"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
          onClick={() => {
            setListenerState({ status: "listening" });
            api
              .listenRoom(roomSlug)
              .then((response) => {
                useRoomStore.getState().setToken(response.websocketToken);
                useRoomStore
                  .getState()
                  .setOwnAccessTier(response.session.accessTier as AccessTier);
                sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
                setListenerState({ status: "ok" });
              })
              .catch(() => {
                setListenerState({
                  status: "error",
                  message: "Could not open room. Try again?",
                });
              });
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  if (
    !token &&
    listenerState?.status !== "ok"
  ) {
    return null;
  }

  const isListener = ownAccessTier === AccessTier.Listener;

  return (
    <main className="grid min-h-screen gap-4 p-4 lg:grid-cols-[1.2fr_420px]">
      <section className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4">
          <h1 className="mb-3 text-2xl font-black">{room?.name ?? "Room"}</h1>
          <YoutubePlayer
            videoId={playback?.videoId}
            nextVideoId={nextVideoId}
            startSeconds={playback?.serverPositionSeconds ?? 0}
            emit={emit}
            {...(playback?.queueItemId
              ? { queueItemId: playback.queueItemId }
              : {})}
          />
          <PlaybackControls
            {...(room?.id !== undefined && { roomId: room.id })}
            roomSlug={roomSlug}
            isListener={isListener}
          />
        </div>
        {isListener ? (
          <ListenerUpgradePrompt
            roomSlug={roomSlug}
            message="Get a nickname to add songs or participate."
          />
        ) : (
          <AddSongInput
            {...(room?.id !== undefined && { roomId: room.id })}
            emit={emit}
            isListener={false}
            roomSlug={roomSlug}
          />
        )}
        <QueuePanel />
        <RoomSettings />
      </section>
      <aside className="grid gap-4 lg:grid-rows-[1fr_260px]">
        <ChatPanel
          emit={emit}
          isListener={isListener}
          roomSlug={roomSlug}
        />
        <ParticipantList />
      </aside>
    </main>
  );
}
