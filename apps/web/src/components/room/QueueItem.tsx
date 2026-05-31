import type { QueueItem as QueueItemType } from "@trackstacc/types";
export function QueueItem({ item }: { item: QueueItemType }) {
  return (
    <article className="rounded-xl bg-zinc-900 p-3">
      <p className="font-semibold">{item.track.title ?? item.track.videoId}</p>
      <p className="text-xs text-zinc-500">
        Score {item.score} · {item.status}
      </p>
    </article>
  );
}
