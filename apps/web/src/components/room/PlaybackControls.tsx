"use client";
import { Button } from "@trackstacc/ui";
import { api } from "@/lib/api";
import { useRoomStore } from "@/stores/room.store";
export function PlaybackControls({ roomId }: { roomId?: string }) {
  const playback = useRoomStore((state) => state.playback);
  return (
    <div className="mt-3 flex items-center justify-between">
      <p className="text-sm text-zinc-300">
        Now playing: {playback?.title ?? "Nothing yet"}
      </p>
      <Button
        variant="secondary"
        disabled={!roomId}
        onClick={() => roomId && api.skip(roomId)}
      >
        Skip
      </Button>
    </div>
  );
}
