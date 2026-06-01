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
  const [playerReady, setPlayerReady] = React.useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  const queueItemRef = React.useRef(queueItemId);
  queueItemRef.current = queueItemId;
  const nextVideoRef = React.useRef(nextVideoId);
  nextVideoRef.current = nextVideoId;
  const loadedVideoRef = React.useRef<string | null>(null);
  const playerRef = React.useRef<YT.Player | null>(null);

  React.useEffect(() => {
    let destroyed = false;
    loadYouTubeApi().then((api) => {
      if (!api || destroyed) return;
      const p = new api.Player("youtube-player", {
        playerVars: {
          autoplay: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            setPlayerReady(true);
            setLoading(false);
          },
          onStateChange: (event) => {
            if (destroyed) return;
            const qid = queueItemRef.current;
            const idPayload = qid ? { queueItemId: qid } : {};

            if (event.data === api.PlayerState.ENDED) {
              emitRef.current({
                type: "playback.clientState",
                status: "ended",
                positionSeconds: 0,
                ...idPayload,
              });
              if (nextVideoRef.current) {
                setLoading(true);
                loadedVideoRef.current = nextVideoRef.current;
                p.loadVideoById({ videoId: nextVideoRef.current });
              }
            }
            if (event.data === api.PlayerState.BUFFERING)
              emitRef.current({
                type: "playback.clientState",
                status: "buffering",
                positionSeconds: p.getCurrentTime(),
                ...idPayload,
              });
            if (event.data === api.PlayerState.PLAYING) {
              setLoading(false);
              setAutoplayBlocked(false);
              emitRef.current({
                type: "playback.clientState",
                status: "playing",
                positionSeconds: p.getCurrentTime(),
                ...idPayload,
              });
            }
            if (event.data === api.PlayerState.PAUSED) {
              setAutoplayBlocked(true);
            }
          },
          onError: () => {
            if (destroyed) return;
            setLoading(false);
          },
        },
      });
      playerRef.current = p;
      setPlayer(p);
    });
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayer(null);
      setPlayerReady(false);
      setLoading(true);
      setAutoplayBlocked(false);
      loadedVideoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!playerReady || !player || !videoId) return;
    if (videoId === loadedVideoRef.current) return;
    loadedVideoRef.current = videoId;
    setLoading(true);
    player.cueVideoById({
      videoId,
      startSeconds: Math.max(0, startSeconds),
    });
    player.playVideo();
  }, [playerReady, player, videoId, startSeconds]);

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

  const showOverlay = autoplayBlocked || !videoId || loading;

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <div id="youtube-player" className="h-full w-full" />
      {showOverlay ? (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950/80">
          {autoplayBlocked || !videoId ? (
            <Button
              onClick={() => {
                if (!player || !videoId) return;
                setAutoplayBlocked(false);
                setLoading(true);
                if (loadedVideoRef.current !== videoId) {
                  loadedVideoRef.current = videoId;
                  player.cueVideoById({
                    videoId,
                    startSeconds: Math.max(0, startSeconds),
                  });
                }
                player.playVideo();
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
