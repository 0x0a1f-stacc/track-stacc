"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { AccessTier } from "@trackstacc/types";
import { Button, Input } from "@trackstacc/ui";
import { api } from "@/lib/api";
import { useRoomStore } from "@/stores/room.store";

const listenerSessionKey = (slug: string) => `ws:${slug}:listenerSessionId`;

export default function JoinPage() {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const router = useRouter();
  const setToken = useRoomStore((state) => state.setToken);
  const setOwnAccessTier = useRoomStore((state) => state.setOwnAccessTier);
  const setListenerSessionId = useRoomStore(
    (state) => state.setListenerSessionId,
  );
  const [displayNickname, setNickname] = React.useState("");
  const [nicknamePassword, setPassword] = React.useState("");
  const [protectedName, setProtectedName] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Read listenerSessionId from sessionStorage (set by RoomShell on /listen)
  const listenerSessionId =
    typeof window !== "undefined"
      ? sessionStorage.getItem(listenerSessionKey(roomSlug))
      : null;

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await api.joinRoom(roomSlug, {
        displayNickname,
        ...(nicknamePassword ? { nicknamePassword } : {}),
        ...(listenerSessionId ? { listenerSessionId } : {}),
      });
      setToken(response.websocketToken);
      setOwnAccessTier(response.session.accessTier as AccessTier);
      // Clear listener session id after successful upgrade
      setListenerSessionId(null);
      sessionStorage.removeItem(listenerSessionKey(roomSlug));
      sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
      sessionStorage.setItem(
        `ws:${roomSlug}:tier`,
        response.session.accessTier,
      );
      localStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
      router.push(`/rooms/${roomSlug}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Join failed";
      if (message.includes("NICKNAME_PROTECTED")) setProtectedName(true);
      setError(message);
    }
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6">
      <form
        onSubmit={(event) => {
          join(event).catch(console.error);
        }}
        className="w-full rounded-3xl border border-white/10 bg-zinc-950/85 p-8"
      >
        <h1 className="text-3xl font-black">Choose your nickname</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Protected nicknames cannot be recovered if you forget the password.
        </p>
        <div className="mt-6 space-y-4">
          <Input
            label="Nickname"
            value={displayNickname}
            onChange={(event) => setNickname(event.target.value)}
            required
          />
          {protectedName ? (
            <Input
              label="Nickname password"
              type="password"
              value={nicknamePassword}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <Button className="w-full">Join room</Button>
        </div>
      </form>
    </main>
  );
}
