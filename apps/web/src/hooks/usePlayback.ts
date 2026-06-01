"use client";

import * as React from "react";
import { useRoomStore } from "@/stores/room.store";

export function usePlayback(player?: YT.Player | null) {
  const playback = useRoomStore((state) => state.playback);
  const lastSeekVideoRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!player || !playback?.startedAt || !playback.videoId) return undefined;
    const videoId = playback.videoId;

    if (lastSeekVideoRef.current === videoId) return undefined;
    lastSeekVideoRef.current = videoId;

    const target = (Date.now() - new Date(playback.startedAt).getTime()) / 1000;
    if (target > 1 && Math.abs(player.getCurrentTime() - target) > 3)
      player.seekTo(target, true);
  }, [player, playback]);

  return {
    videoId: playback?.videoId ?? null,
    status: playback?.status ?? "stopped",
    positionSeconds: playback?.serverPositionSeconds ?? 0,
    title: playback?.title ?? null,
  };
}
