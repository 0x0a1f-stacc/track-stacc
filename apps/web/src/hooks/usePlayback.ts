"use client";

import * as React from "react";
import { useRoomStore } from "@/stores/room.store";

export function usePlayback(player?: YT.Player | null) {
  const playback = useRoomStore((state) => state.playback);
  React.useEffect(() => {
    if (!player || !playback?.startedAt) return undefined;
    const interval = window.setInterval(() => {
      const target =
        (Date.now() - new Date(playback.startedAt!).getTime()) / 1000;
      if (Math.abs(player.getCurrentTime() - target) > 3)
        player.seekTo(target, true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [player, playback]);
  return {
    videoId: playback?.videoId ?? null,
    status: playback?.status ?? "stopped",
    positionSeconds: playback?.serverPositionSeconds ?? 0,
    title: playback?.title ?? null,
  };
}
