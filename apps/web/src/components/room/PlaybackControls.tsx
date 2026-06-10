"use client";
import { Button } from "@trackstacc/ui";
import { api } from "@/lib/api";
import { useRoomStore } from "@/stores/room.store";
import { ListenerUpgradePrompt } from "./ListenerUpgradePrompt";
export function PlaybackControls({
  roomId,
  roomSlug,
  isListener,
}: {
  roomId?: string;
  roomSlug: string;
  isListener: boolean;
}) {
  const playback = useRoomStore((state) => state.playback);
  if (isListener) {
    return (
      <div className="mt-3">
        <p className="mb-2 text-sm text-zinc-300">
          Now playing: {playback?.title ?? "Nothing yet"}
        </p>
        <ListenerUpgradePrompt
          roomSlug={roomSlug}
          message="Get a nickname to skip or participate."
        />
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center justify-between">
      <p className="text-sm text-zinc-300">
        Now playing: {playback?.title ?? "Nothing yet"}
      </p>
      <Button
        variant="secondary"
        disabled={!roomId}
        onClick={() => { if (roomId) void api.skip(roomId); }}
      >
        Skip
      </Button>
    </div>
  );
}
