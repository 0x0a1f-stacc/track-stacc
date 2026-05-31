"use client";
import { useQueue } from "@/hooks/useQueue";
import { QueueItem } from "./QueueItem";
export function QueuePanel() {
  const queue = useQueue();
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
      <h2 className="font-bold">Queue</h2>
      <div className="mt-3 space-y-2">
        {queue.map((item) => (
          <QueueItem key={item.id} item={item} />
        ))}
        {queue.length === 0 ? (
          <p className="text-sm text-zinc-500">No songs queued yet.</p>
        ) : null}
      </div>
    </section>
  );
}
