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
  const queueItemRef = React.useRef(queueItemId);
  const nextVideoRef = React.useRef(nextVideoId);
  const videoIdRef = React.useRef(videoId);
  const startSecondsRef = React.useRef(startSeconds);
  const loadedVideoRef = React.useRef<string | null>(null);
  const playerRef = React.useRef<YT.Player | null>(null);
  const everPlayedRef = React.useRef(false);

  React.useEffect(() => {
    emitRef.current = emit;
  }, [emit]);
  React.useEffect(() => {
    queueItemRef.current = queueItemId;
  }, [queueItemId]);
  React.useEffect(() => {
    nextVideoRef.current = nextVideoId;
  }, [nextVideoId]);
  React.useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);
  React.useEffect(() => {
    startSecondsRef.current = startSeconds;
  }, [startSeconds]);

  function loadVideo(player: YT.Player, id: string, offset: number) {
    loadedVideoRef.current = id;
    everPlayedRef.current = true;
    setAutoplayBlocked(false);
    setLoading(true);
    player.loadVideoById({
      videoId: id,
      startSeconds: Math.max(0, offset),
    });
  }

  React.useEffect(() => {
    let destroyed = false;
    loadYouTubeApi()
      .then((api) => {
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
              const id = videoIdRef.current;
              if (id) {
                loadVideo(p, id, startSecondsRef.current);
              }
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
                const next = nextVideoRef.current;
                if (next) {
                  setAutoplayBlocked(false);
                  loadVideo(p, next, 0);
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
                everPlayedRef.current = true;
                setAutoplayBlocked(false);
                emitRef.current({
                  type: "playback.clientState",
                  status: "playing",
                  positionSeconds: p.getCurrentTime(),
                  ...idPayload,
                });
              }
              if (event.data === api.PlayerState.PAUSED) {
                if (!everPlayedRef.current) setAutoplayBlocked(true);
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
      })
      .catch(() => undefined);
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayer(null);
      setPlayerReady(false);
      setLoading(true);
      setAutoplayBlocked(false);
      loadedVideoRef.current = null;
      everPlayedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!playerReady || !player || !videoId) return;
    if (videoId === loadedVideoRef.current) return;
    loadVideo(player, videoId, startSeconds);
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
                if (loadedVideoRef.current !== videoId) {
                  loadVideo(player, videoId, startSeconds);
                } else {
                  everPlayedRef.current = true;
                  setLoading(false);
                  player.playVideo();
                }
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
