"use client";

import Link from "next/link";

export function ListenerUpgradePrompt({
  roomSlug,
  message,
}: {
  roomSlug: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 p-4 text-center">
      <p className="mb-2 text-sm text-zinc-400">{message}</p>
      <Link
        href={`/rooms/${roomSlug}/join`}
        className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
      >
        Get a nickname
      </Link>
    </div>
  );
}
