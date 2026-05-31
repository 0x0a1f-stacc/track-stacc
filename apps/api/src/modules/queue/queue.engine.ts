import type { PrismaClient } from "@prisma/client";

type QueueCandidate = { id: string } | null;
type RankedQueueItem = {
  id: string;
  score: number;
  createdAt: Date;
  addedBySessionId: string | null;
};
type RecentCount = { addedBySessionId: string | null; _count: number };

export async function selectNextFIFO(prisma: PrismaClient, roomId: string) {
  return prisma.queueItem.findFirst({
    where: { roomId, status: "queued" },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { track: true },
  });
}

export async function selectNextVoting(prisma: PrismaClient, roomId: string) {
  const candidates = (await prisma.queueItem.findMany({
    where: { roomId, status: "queued" },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    include: { track: true },
  })) as RankedQueueItem[];
  if (candidates.length < 2) return candidates[0] ?? null;
  const recentItems = (await prisma.queueItem.findMany({
    where: {
      roomId,
      status: { in: ["played", "skipped"] },
      endedAt: { gte: new Date(Date.now() - 3 * 60 * 60_000) },
    },
    select: { addedBySessionId: true },
  })) as Array<Pick<RecentCount, "addedBySessionId">>;
  const counts = new Map<string | null, number>();
  for (const item of recentItems)
    counts.set(
      item.addedBySessionId,
      (counts.get(item.addedBySessionId) ?? 0) + 1,
    );
  return (
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (counts.get(a.addedBySessionId) ?? 0) -
          (counts.get(b.addedBySessionId) ?? 0) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

export async function selectNextDJRotation(
  prisma: PrismaClient,
  roomId: string,
) {
  const activeSince = new Date(Date.now() - 90_000);
  const sessions = await prisma.roomSession.findMany({
    where: {
      roomId,
      isMuted: false,
      isBanned: false,
      leftAt: null,
      lastSeenAt: { gte: activeSince },
    },
    orderBy: { joinedAt: "asc" },
  });
  for (const session of sessions) {
    const item = await prisma.queueItem.findFirst({
      where: { roomId, addedBySessionId: session.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      include: { track: true },
    });
    if (item) return item;
  }
  return selectNextFIFO(prisma, roomId);
}

export async function selectNextHostCurated(
  prisma: PrismaClient,
  roomId: string,
) {
  return prisma.queueItem.findFirst({
    where: {
      roomId,
      status: "queued",
      addedBySession: { role: { in: ["host", "moderator"] } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { track: true },
  });
}

export async function selectNextTrack(
  prisma: PrismaClient,
  roomId: string,
  mechanic: string,
): Promise<QueueCandidate> {
  if (mechanic === "voting") return selectNextVoting(prisma, roomId);
  if (mechanic === "dj_rotation") return selectNextDJRotation(prisma, roomId);
  if (mechanic === "host_curated") return selectNextHostCurated(prisma, roomId);
  return selectNextFIFO(prisma, roomId);
}
