import { AccessTier, Role } from "@trackstacc/types";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { createConfigPlugin, type ApiConfig } from "../lib/config.js";
import {
  presenceKey,
  markSessionPresent,
  cleanupInactiveSessions,
  getParticipants,
  evictSessionPresence,
} from "../realtime/presence.manager.js";

interface MockRedis {
  zadd: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  zrangebyscore: ReturnType<typeof vi.fn>;
  zremrangebyscore: ReturnType<typeof vi.fn>;
  zrange: ReturnType<typeof vi.fn>;
  zrem: ReturnType<typeof vi.fn>;
}

interface MockPrisma {
  roomSession: {
    updateMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
}

const BASE_CONFIG: ApiConfig = {
  databaseUrl: "postgresql://test:test@localhost:5432/test",
  redisUrl: "redis://localhost:6379",
  sessionSecret: "test-secret-for-testing-only-1234567890",
  corsOrigins: ["http://localhost:3000"],
  youtubeApiKey: null,
  port: 0,
  host: "0.0.0.0",
  nodeEnv: "test",
};

const anyDate = () => expect.any(Date) as unknown as Date;
const anyString = () => expect.any(String) as unknown as string;

describe("Presence Lifecycle Manager", () => {
  let app: FastifyInstance;
  let mockRedis: MockRedis;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    app = Fastify({ logger: false });
    app.register(createConfigPlugin(BASE_CONFIG));

    mockRedis = {
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      zrangebyscore: vi.fn().mockResolvedValue([]),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zrange: vi.fn().mockResolvedValue([]),
      zrem: vi.fn().mockResolvedValue(1),
    };

    mockPrisma = {
      roomSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    app.decorate("redis", mockRedis as unknown as typeof app.redis);
    app.decorate("prisma", mockPrisma as unknown as typeof app.prisma);
  });

  it("evictSessionPresence ZREMs session ID from Redis", async () => {
    await evictSessionPresence(app, "room-1", "session-1");
    expect(mockRedis.zrem).toHaveBeenCalledWith(presenceKey("room-1"), "session-1");
  });

  it("markSessionPresent ZADDs session ID to ZSET and sets 24h expire", async () => {
    await markSessionPresent(app, "room-1", "session-1");
    expect(mockRedis.zadd).toHaveBeenCalledWith(presenceKey("room-1"), expect.any(Number), "session-1");
    expect(mockRedis.expire).toHaveBeenCalledWith(presenceKey("room-1"), 86400);
  });

  it("cleanupInactiveSessions prunes expired sessions and updates DB leftAt", async () => {
    mockRedis.zrangebyscore.mockResolvedValue(["expired-session-1"]);
    mockRedis.zremrangebyscore.mockResolvedValue(1);

    await cleanupInactiveSessions(app, "room-1");

    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith(presenceKey("room-1"), "-inf", expect.any(Number));
    expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(presenceKey("room-1"), "-inf", expect.any(Number));
    expect(mockPrisma.roomSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["expired-session-1"] },
        leftAt: null,
      },
      data: { leftAt: anyDate() },
    });
  });

  it("cleanupInactiveSessions falls back to DB cleanup on Redis failure", async () => {
    mockRedis.zrangebyscore.mockRejectedValue(new Error("Redis offline"));

    await cleanupInactiveSessions(app, "room-1");

    expect(mockPrisma.roomSession.updateMany).toHaveBeenCalledWith({
      where: {
        roomId: "room-1",
        lastSeenAt: { lt: anyDate() },
        leftAt: null,
      },
      data: { leftAt: anyDate() },
    });
  });

  it("getParticipants queries ZSET active sessions and SQL rows", async () => {
    mockRedis.zrange.mockResolvedValue(["active-session-1"]);
    mockPrisma.roomSession.findMany.mockResolvedValue([
      {
        id: "active-session-1",
        displayNickname: "Alice",
        normalizedNickname: "alice",
        accessTier: "member",
        role: "participant",
        nicknameClaimId: "claim-1",
        isMuted: false,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      },
    ]);

    const participants = await getParticipants(app, "room-1");

    expect(mockRedis.zrange).toHaveBeenCalledWith(presenceKey("room-1"), 0, -1);
    expect(mockPrisma.roomSession.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["active-session-1"] },
        isBanned: false,
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    });
    expect(participants.length).toBe(1);
    expect(participants[0]).toEqual({
      roomSessionId: "active-session-1",
      displayNickname: "Alice",
      normalizedNickname: "alice",
      accessTier: AccessTier.Member,
      role: Role.Participant,
      protectedNickname: true,
      presence: "online",
      isMuted: false,
      joinedAt: anyString(),
      lastSeenAt: anyString(),
    });
  });

  it("getParticipants falls back to DB query when Redis is degraded", async () => {
    mockRedis.zrange.mockRejectedValue(new Error("Redis offline"));
    mockPrisma.roomSession.findMany.mockResolvedValue([
      {
        id: "active-session-2",
        displayNickname: null,
        normalizedNickname: null,
        accessTier: "listener",
        role: "listener",
        nicknameClaimId: null,
        isMuted: false,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      },
    ]);

    const participants = await getParticipants(app, "room-1");

    expect(mockPrisma.roomSession.findMany).toHaveBeenCalledWith({
      where: {
        roomId: "room-1",
        isBanned: false,
        lastSeenAt: { gte: anyDate() },
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    });
    expect(participants.length).toBe(1);
    expect(participants[0]?.roomSessionId).toBe("active-session-2");
    expect(participants[0]?.accessTier).toBe(AccessTier.Listener);
  });

  it("filters banned sessions out of Redis-backed participant lookups", async () => {
    mockRedis.zrange.mockResolvedValue(["banned-session-1"]);
    mockPrisma.roomSession.findMany.mockResolvedValue([]);

    const participants = await getParticipants(app, "room-1");

    expect(mockPrisma.roomSession.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["banned-session-1"] },
        isBanned: false,
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    });
    expect(participants).toEqual([]);
  });
});
