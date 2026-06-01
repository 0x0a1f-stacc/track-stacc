"use client";

import * as React from "react";
import type { ClientEvent } from "@trackstacc/types";
import { Button, Spinner } from "@trackstacc/ui";
import { loadYouTubeApi } from "@/lib/youtube";

export function YoutubePlayer({
  videoId,
  nextVideoId,
  startSeconds,
  queueItemId,
  emit,
}: {
  videoId: string | null | undefined;
  nextVideoId: string | null | undefined;
  startSeconds: number;
  queueItemId?: string;
  emit: (event: ClientEvent) => void;
}) {
  const [player, setPlayer] = React.useState<YT.Player | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const queueItemRef = React.useRef(queueItemId);
  queueItemRef.current = queueItemId;
  const nextVideoRef = React.useRef(nextVideoId);
  nextVideoRef.current = nextVideoId;
  const loadedVideoRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    loadYouTubeApi().then((api) => {
      if (!api) return;
      const next = new api.Player("youtube-player", {
        playerVars: {
          autoplay: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setLoading(false),
          onStateChange: (event) => {
            const qid = queueItemRef.current;
            const idPayload = qid ? { queueItemId: qid } : {};

            if (event.data === api.PlayerState.ENDED) {
              emitRef.current({
                type: "playback.clientState",
                status: "ended",
                positionSeconds: startSeconds,
                ...idPayload,
              });
              if (nextVideoRef.current) {
                setLoading(true);
                loadedVideoRef.current = nextVideoRef.current;
                next.loadVideoById({ videoId: nextVideoRef.current });
              }
            }
            if (event.data === api.PlayerState.BUFFERING)
              emitRef.current({
                type: "playback.clientState",
                status: "buffering",
                positionSeconds: next.getCurrentTime(),
                ...idPayload,
              });
            if (event.data === api.PlayerState.PLAYING) {
              setLoading(false);
              emitRef.current({
                type: "playback.clientState",
                status: "playing",
                positionSeconds: next.getCurrentTime(),
                ...idPayload,
              });
            }
          },
        },
      });
      setPlayer(next);
    });
    return () => {
      player?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (player && videoId) {
      if (videoId === loadedVideoRef.current) return;
      loadedVideoRef.current = videoId;
      setLoading(true);
      try {
        player.loadVideoById({ videoId });
        if (startSeconds > 1) player.seekTo(startSeconds, true);
      } catch {
        setBlocked(true);
        setLoading(false);
      }
    }
  }, [player, videoId]);

  React.useEffect(() => {
    if (!player || !queueItemId) return;
    const interval = window.setInterval(() => {
      const state = player.getPlayerState();
      if (state === 3 /* BUFFERING */) {
        emit({
          type: "playback.clientState",
          status: "buffering",
          positionSeconds: player.getCurrentTime(),
          queueItemId,
        });
      }
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [player, queueItemId, emit]);

  const showOverlay = blocked || !videoId || loading;

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <div id="youtube-player" className="h-full w-full" />
      {showOverlay ? (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950/80">
          {blocked || !videoId ? (
            <Button
              onClick={() => {
                setBlocked(false);
                player?.playVideo();
              }}
            >
              Click to play
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-sm text-zinc-400">Loading...</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
