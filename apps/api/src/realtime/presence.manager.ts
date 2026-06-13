import type { FastifyInstance } from "fastify";
import { AccessTier, Role } from "@trackstacc/types";

type PresenceSession = {
  id: string;
  displayNickname: string | null;
  normalizedNickname: string | null;
  accessTier: "listener" | "member";
  role: "listener" | "participant" | "moderator" | "host";
  nicknameClaimId: string | null;
  isMuted: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
};

export function presenceKey(roomId: string): string {
  return `room:${roomId}:presence`;
}

/**
 * Mark a room session present in the Redis ZSET.
 */
export async function markSessionPresent(
  app: FastifyInstance,
  roomId: string,
  roomSessionId: string,
): Promise<void> {
  const key = presenceKey(roomId);
  const now = Date.now();
  try {
    await app.redis.zadd(key, now, roomSessionId);
    await app.redis.expire(key, 86400); // 24-hour TTL
  } catch (err) {
    app.log.warn({ err, roomId, roomSessionId }, "Failed to mark session present in Redis");
  }
}

/**
 * Sweeps inactive room sessions (older than 60 seconds) out of Redis and PostgreSQL.
 */
export async function cleanupInactiveSessions(
  app: FastifyInstance,
  roomId: string,
): Promise<void> {
  const now = Date.now();
  const threshold = now - 60_000;
  const key = presenceKey(roomId);

  try {
    const expiredIds = await app.redis.zrangebyscore(key, "-inf", threshold);
    if (expiredIds.length > 0) {
      await app.redis.zremrangebyscore(key, "-inf", threshold);
      if (app.prisma.roomSession.updateMany) {
        await app.prisma.roomSession.updateMany({
          where: {
            id: { in: expiredIds },
            leftAt: null,
          },
          data: { leftAt: new Date() },
        });
      }
    }
  } catch (err) {
    app.log.warn({ err, roomId }, "Redis presence cleanup failed, falling back to PostgreSQL");
    const activeLimit = new Date(Date.now() - 60_000);
    if (app.prisma.roomSession.updateMany) {
      await app.prisma.roomSession.updateMany({
        where: {
          roomId,
          lastSeenAt: { lt: activeLimit },
          leftAt: null,
        },
        data: { leftAt: new Date() },
      });
    }
  }
}

/**
 * Fetches the active participants for a room, cleaning up inactive ones first.
 */
export async function getParticipants(app: FastifyInstance, roomId: string) {
  const now = Date.now();
  const threshold = now - 60_000;
  const key = presenceKey(roomId);

  let activeSessionIds: string[] | null = null;
  try {
    // Perform cleanup first
    const expiredIds = await app.redis.zrangebyscore(key, "-inf", threshold);
    if (expiredIds.length > 0) {
      await app.redis.zremrangebyscore(key, "-inf", threshold);
      if (app.prisma.roomSession.updateMany) {
        await app.prisma.roomSession.updateMany({
          where: {
            id: { in: expiredIds },
            leftAt: null,
          },
          data: { leftAt: new Date() },
        });
      }
    }
    activeSessionIds = await app.redis.zrange(key, 0, -1);
  } catch (err) {
    app.log.warn({ err, roomId }, "Failed to get active presence session IDs from Redis");
  }

  let sessions: PresenceSession[];
  if (activeSessionIds !== null) {
    sessions = (await app.prisma.roomSession.findMany({
      where: {
        id: { in: activeSessionIds },
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    })) as PresenceSession[];
  } else {
    // Fallback: Query PostgreSQL directly using lastSeenAt index
    const activeLimit = new Date(Date.now() - 60_000);
    sessions = (await app.prisma.roomSession.findMany({
      where: {
        roomId,
        lastSeenAt: { gte: activeLimit },
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    })) as PresenceSession[];
  }

  const roleMap = {
    listener: Role.Listener,
    participant: Role.Participant,
    moderator: Role.Moderator,
    host: Role.Host,
  } as const;
  const tierMap = {
    listener: AccessTier.Listener,
    member: AccessTier.Member,
  } as const;

  return sessions.map((session) => ({
    roomSessionId: session.id,
    displayNickname: session.displayNickname,
    normalizedNickname: session.normalizedNickname,
    accessTier: tierMap[session.accessTier],
    role: roleMap[session.role],
    protectedNickname: Boolean(session.nicknameClaimId),
    presence: "online" as const,
    isMuted: session.isMuted,
    joinedAt: session.joinedAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
  }));
}

