"use client";

import * as React from "react";
import type { ClientEvent } from "@trackstacc/types";
import { Button } from "@trackstacc/ui";
import { loadYouTubeApi } from "@/lib/youtube";

export function YoutubePlayer({
  videoId,
  startSeconds,
  queueItemId,
  emit,
}: {
  videoId: string | null | undefined;
  startSeconds: number;
  queueItemId?: string;
  emit: (event: ClientEvent) => void;
}) {
  const [player, setPlayer] = React.useState<YT.Player | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  React.useEffect(() => {
    loadYouTubeApi().then((api) => {
      if (!api) return;
      const next = new api.Player("youtube-player", {
        playerVars: { rel: 0 },
        events: {
          onStateChange: (event) => {
            const idPayload = queueItemId ? { queueItemId } : {};
            if (event.data === api.PlayerState.ENDED)
              emit({
                type: "playback.clientState",
                status: "ended",
                positionSeconds: startSeconds,
                ...idPayload,
              });
            if (event.data === api.PlayerState.BUFFERING)
              emit({
                type: "playback.clientState",
                status: "buffering",
                positionSeconds: next.getCurrentTime(),
                ...idPayload,
              });
          },
        },
      });
      setPlayer(next);
    });
    return () => {
      player?.destroy();
    };
  }, []);
  React.useEffect(() => {
    if (player && videoId) {
      try {
        player.loadVideoById({ videoId, startSeconds });
      } catch {
        setBlocked(true);
      }
    }
  }, [player, startSeconds, videoId]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <div id="youtube-player" className="h-full w-full" />
      {blocked || !videoId ? (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950/80">
          <Button
            onClick={() => {
              setBlocked(false);
              player?.playVideo();
            }}
          >
            Click to play
          </Button>
        </div>
      ) : null}
    </div>
  );
}
