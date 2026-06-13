import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { AccessTier, Role } from "@trackstacc/types";
import { createConfigPlugin } from "../lib/config.js";
import {
  presenceKey,
  markSessionPresent,
  cleanupInactiveSessions,
  getParticipants,
} from "../realtime/presence.manager.js";

const BASE_CONFIG = {
  databaseUrl: "postgresql://test:test@localhost:5432/test",
  redisUrl: "redis://localhost:6379",
  sessionSecret: "test-secret-for-testing-only-1234567890",
  corsOrigins: ["http://localhost:3000"],
  youtubeApiKey: null,
  port: 0,
  host: "0.0.0.0",
  nodeEnv: "test",
};

describe("Presence Lifecycle Manager", () => {
  let app: FastifyInstance;
  let mockRedis: any;
  let mockPrisma: any;

  beforeEach(() => {
    app = Fastify({ logger: false });
    app.register(createConfigPlugin(BASE_CONFIG as any));

    mockRedis = {
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      zrangebyscore: vi.fn().mockResolvedValue([]),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zrange: vi.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      roomSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    app.decorate("redis", mockRedis);
    app.decorate("prisma", mockPrisma);
  });

  it("markSessionPresent ZADDs session ID to ZSET and sets 24h expire", async () => {
    await markSessionPresent(app, "room-1", "session-1");
    expect(mockRedis.zadd).toHaveBeenCalledWith("room:room-1:presence", expect.any(Number), "session-1");
    expect(mockRedis.expire).toHaveBeenCalledWith("room:room-1:presence", 86400);
  });

  it("cleanupInactiveSessions prunes expired sessions and updates DB leftAt", async () => {
    mockRedis.zrangebyscore.mockResolvedValue(["expired-session-1"]);
    mockRedis.zremrangebyscore.mockResolvedValue(1);

    await cleanupInactiveSessions(app, "room-1");

    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith("room:room-1:presence", "-inf", expect.any(Number));
    expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith("room:room-1:presence", "-inf", expect.any(Number));
    expect(mockPrisma.roomSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["expired-session-1"] },
        leftAt: null,
      },
      data: { leftAt: expect.any(Date) },
    });
  });

  it("cleanupInactiveSessions falls back to DB cleanup on Redis failure", async () => {
    mockRedis.zrangebyscore.mockRejectedValue(new Error("Redis offline"));

    await cleanupInactiveSessions(app, "room-1");

    expect(mockPrisma.roomSession.updateMany).toHaveBeenCalledWith({
      where: {
        roomId: "room-1",
        lastSeenAt: { lt: expect.any(Date) },
        leftAt: null,
      },
      data: { leftAt: expect.any(Date) },
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

    expect(mockRedis.zrange).toHaveBeenCalledWith("room:room-1:presence", 0, -1);
    expect(mockPrisma.roomSession.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["active-session-1"] },
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
      joinedAt: expect.any(String),
      lastSeenAt: expect.any(String),
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
        lastSeenAt: { gte: expect.any(Date) },
        leftAt: null,
      },
      orderBy: { joinedAt: "asc" },
    });
    expect(participants.length).toBe(1);
    expect(participants[0]?.roomSessionId).toBe("active-session-2");
    expect(participants[0]?.accessTier).toBe(AccessTier.Listener);
  });
});
