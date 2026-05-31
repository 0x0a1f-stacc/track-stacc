"use client";
import * as React from "react";
import type { ClientEvent } from "@trackstacc/types";
import { Button, Input } from "@trackstacc/ui";
export function AddSongInput({
  emit,
}: {
  roomId?: string;
  emit: (event: ClientEvent) => void;
}) {
  const [youtubeUrl, setUrl] = React.useState("");
  return (
    <form
      className="flex gap-2 rounded-2xl border border-white/10 bg-zinc-950/80 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        emit({ type: "queue.add", youtubeUrl });
        setUrl("");
      }}
    >
      <Input
        value={youtubeUrl}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="Paste a YouTube URL"
      />
      <Button>Add</Button>
    </form>
  );
}
