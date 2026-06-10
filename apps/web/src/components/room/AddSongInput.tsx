"use client";
import * as React from "react";
import type { ClientEvent } from "@trackstacc/types";
import { Button, Input } from "@trackstacc/ui";
import { useRoomStore } from "@/stores/room.store";
import { ListenerUpgradePrompt } from "./ListenerUpgradePrompt";

export function AddSongInput({
  emit,
  isListener,
  roomSlug,
}: {
  emit: (event: ClientEvent) => void;
  isListener: boolean;
  roomSlug: string;
}) {
  const [youtubeUrl, setUrl] = React.useState("");
  const lastError = useRoomStore((state) => state.lastError);

  React.useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(() => {
      useRoomStore.setState({ lastError: null });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [lastError]);

  if (isListener) {
    return (
      <ListenerUpgradePrompt
        roomSlug={roomSlug}
        message="Get a nickname to add songs or participate."
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/80 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        useRoomStore.setState({ lastError: null });
        emit({ type: "queue.add", youtubeUrl });
        setUrl("");
      }}
    >
      <div className="flex gap-2">
        <Input
          value={youtubeUrl}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube URL"
        />
        <Button>Add</Button>
      </div>
      {lastError ? <p className="text-sm text-red-400">{lastError}</p> : null}
    </form>
  );
}
