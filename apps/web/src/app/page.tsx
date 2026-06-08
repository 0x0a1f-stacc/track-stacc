"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Input } from "@trackstacc/ui";
import { PlaylistMechanic } from "@trackstacc/types";
import { api } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [playlistMechanic, setMechanic] = React.useState<PlaylistMechanic>(
    PlaylistMechanic.FIFO,
  );
  const [loading, setLoading] = React.useState(false);
  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await api.createRoom({
      ...(name ? { name } : {}),
      playlistMechanic,
    });
    router.push(`/rooms/${response.room.slug}/join`);
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl place-items-center px-6">
      <form
        onSubmit={(event) => { createRoom(event).catch(console.error); }}
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-brand-200">
          trackstacc.live
        </p>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-white">
          Stack a room. Pass the aux.
        </h1>
        <p className="mt-4 text-zinc-300">
          Create a real-time YouTube music room with chat, voting, and host
          controls.
        </p>
        <div className="mt-8 space-y-4">
          <Input
            label="Room name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Friday Night Aux"
          />
          <label className="block space-y-2 text-sm text-zinc-200">
            <span>Playlist mechanic</span>
            <select
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              value={playlistMechanic}
              onChange={(event) =>
                setMechanic(event.target.value as PlaylistMechanic)
              }
            >
              <option value="fifo">First come, first served</option>
              <option value="voting">Voting queue</option>
              <option value="dj_rotation">DJ rotation</option>
              <option value="host_curated">Host curated</option>
            </select>
          </label>
          <Button disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create room"}
          </Button>
        </div>
      </form>
    </main>
  );
}
