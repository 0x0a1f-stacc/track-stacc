"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { AccessTier, QueueItemStatus } from "@trackstacc/types";
import { useSocket } from "@/hooks/useSocket";
import { useRoomStore } from "@/stores/room.store";
import { api } from "@/lib/api";
import { AddSongInput } from "./AddSongInput";
import { ChatPanel } from "./ChatPanel";
import { ParticipantList } from "./ParticipantList";
import { PlaybackControls } from "./PlaybackControls";
import { QueuePanel } from "./QueuePanel";
import { RoomSettings } from "./RoomSettings";
import { YoutubePlayer } from "./YoutubePlayer";
import { ProtectNicknameModal } from "../nickname/ProtectNicknameModal";

type ListenerState =
  | { status: "listening" }
  | { status: "error"; message: string }
  | { status: "password-required" }
  | { status: "ok" };

const listenerSessionKey = (roomSlug: string) =>
  `ws:${roomSlug}:listenerSessionId`;

export function RoomShell({ roomSlug }: { roomSlug: string }) {
  const router = useRouter();
  const token = useRoomStore((state) => state.websocketToken);
  const ownAccessTier = useRoomStore((state) => state.ownAccessTier);
  const listenerSessionId = useRoomStore((state) => state.listenerSessionId);
  const playback = useRoomStore((state) => state.playback);
  const room = useRoomStore((state) => state.room);
  const queue = useRoomStore((state) => state.queue);
  const { emit } = useSocket(token);
  const [listenerState, setListenerState] =
    React.useState<ListenerState | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = React.useState(false);
  const listenInFlightRef = React.useRef(false);

  React.useEffect(() => {
    if (token) return;
    const stored =
      sessionStorage.getItem(`ws:${roomSlug}`) ??
      localStorage.getItem(`ws:${roomSlug}`);
    if (stored) {
      useRoomStore.getState().setToken(stored);
      const storedTier = sessionStorage.getItem(`ws:${roomSlug}:tier`);
      if (storedTier === "listener" || storedTier === "member") {
        useRoomStore.getState().setOwnAccessTier(storedTier as AccessTier);
      }
      // Recover listenerSessionId if still needed (e.g. listener tier on refresh)
      const storedListenerId = sessionStorage.getItem(
        listenerSessionKey(roomSlug),
      );
      if (storedListenerId) {
        useRoomStore.getState().setListenerSessionId(storedListenerId);
      }
      return;
    }

    // Prevent duplicate in-flight requests — the ref is set to true on the
    // first effect run and is NOT reset in the cleanup. React 18 StrictMode
    // double-mount preserves the ref across unmount → remount, so the second
    // effect run finds ref=true and returns early. Only one fetch reaches the
    // server. The ref is released in the success/error handler for subsequent
    // navigation.
    if (listenInFlightRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    listenInFlightRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListenerState({ status: "listening" });

    api
      .listenRoom(roomSlug)
      .then((response) => {
        listenInFlightRef.current = false;
        useRoomStore.getState().setToken(response.websocketToken);
        useRoomStore
          .getState()
          .setOwnAccessTier(response.session.accessTier as AccessTier);
        useRoomStore
          .getState()
          .setListenerSessionId(response.session.roomSessionId);
        sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
        sessionStorage.setItem(
          `ws:${roomSlug}:tier`,
          response.session.accessTier,
        );
        sessionStorage.setItem(
          listenerSessionKey(roomSlug),
          response.session.roomSessionId,
        );
        setListenerState({ status: "ok" });
      })
      .catch((caught: unknown) => {
        listenInFlightRef.current = false;
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

    return () => {
      // Do NOT reset listenInFlightRef here. StrictMode calls cleanup before
      // the second mount; resetting the ref would allow a duplicate request.
    };
  }, [roomSlug, token]);

  React.useEffect(() => {
    if (listenerState?.status === "password-required") {
      router.replace(`/rooms/${roomSlug}/join`);
    }
  }, [listenerState, roomSlug, router]);

  const handleUpgrade = React.useCallback(
    (response: { websocketToken: string; session: { accessTier: string } }) => {
      // Replace the WebSocket token with the member-tier token
      useRoomStore.getState().setToken(response.websocketToken);
      useRoomStore
        .getState()
        .setOwnAccessTier(response.session.accessTier as AccessTier);
      // Listener session is no longer needed after upgrade; clear it
      useRoomStore.getState().setListenerSessionId(null);

      // Persist to sessionStorage
      sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
      sessionStorage.setItem(
        `ws:${roomSlug}:tier`,
        response.session.accessTier,
      );
      sessionStorage.removeItem(listenerSessionKey(roomSlug));

      // Close the modal
      setUpgradeModalOpen(false);
    },
    [roomSlug],
  );

  const openUpgradeModal = React.useCallback(() => {
    setUpgradeModalOpen(true);
  }, []);

  const closeUpgradeModal = React.useCallback(() => {
    setUpgradeModalOpen(false);
  }, []);

  const nextQueuedItem = React.useMemo(() => {
    return queue.find(
      (item) =>
        item.status === QueueItemStatus.Queued &&
        item.track.provider === "youtube",
    );
  }, [queue]);
  const nextVideoId = nextQueuedItem?.track.videoId ?? null;

  if (listenerState?.status === "listening") {
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
              .then((res) => {
                useRoomStore.getState().setToken(res.websocketToken);
                useRoomStore
                  .getState()
                  .setOwnAccessTier(res.session.accessTier as AccessTier);
                useRoomStore
                  .getState()
                  .setListenerSessionId(res.session.roomSessionId);
                sessionStorage.setItem(`ws:${roomSlug}`, res.websocketToken);
                sessionStorage.setItem(
                  `ws:${roomSlug}:tier`,
                  res.session.accessTier,
                );
                sessionStorage.setItem(
                  listenerSessionKey(roomSlug),
                  res.session.roomSessionId,
                );
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

  if (!token && listenerState?.status !== "ok") {
    return null;
  }

  const canParticipate = ownAccessTier === AccessTier.Member;

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
            canParticipate={canParticipate}
            onUpgrade={openUpgradeModal}
          />
        </div>
        <AddSongInput
          emit={emit}
          canParticipate={canParticipate}
          roomSlug={roomSlug}
          onUpgrade={openUpgradeModal}
        />
        <QueuePanel />
        <RoomSettings />
      </section>
      <aside className="grid gap-4 lg:grid-rows-[1fr_260px]">
        <ChatPanel
          emit={emit}
          canParticipate={canParticipate}
          roomSlug={roomSlug}
          onUpgrade={openUpgradeModal}
        />
        <ParticipantList />
      </aside>

      <ProtectNicknameModal
        open={upgradeModalOpen}
        roomSlug={roomSlug}
        listenerSessionId={listenerSessionId}
        onClose={closeUpgradeModal}
        onUpgrade={handleUpgrade}
      />
    </main>
  );
}
