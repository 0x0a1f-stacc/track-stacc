import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import type { Room, RoomSession, NicknameClaim, Prisma } from "@prisma/client";
import { AccessTier, Role, NicknameClaimStatus } from "@prisma/client";
import type { ClientEvent } from "@trackstacc/types";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Socket, Server } from "socket.io";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { signWsToken, verifyWsToken } from "../lib/tokens.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";
import { playbackRouter } from "../modules/playback/playback.router.js";
import { roomsRouter } from "../modules/rooms/rooms.router.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";
import authPlugin from "../plugins/auth.js";
import { registerRoomHandlers } from "../realtime/room.gateway.js";


// Mock argon2 password hashing dynamically
vi.mock("../lib/argon2.js", () => ({
  hashPassword: vi.fn().mockImplementation((pwd: string) => Promise.resolve(`hashed-${pwd}`)),
  verifyPassword: vi.fn().mockImplementation((hash: string, pwd: string) => Promise.resolve(hash === `hashed-${pwd}`)),
}));

// Mock Socket.IO broadcast module
vi.mock("../realtime/broadcast.js", () => ({
  broadcast: vi.fn(),
  roomChannel: vi.fn().mockReturnValue("room:mocked"),
}));

// Mock presence manager
vi.mock("../realtime/presence.manager.js", () => ({
  cleanupInactiveSessions: vi.fn().mockResolvedValue(undefined),
  markSessionPresent: vi.fn().mockResolvedValue(undefined),
  getParticipants: vi.fn().mockResolvedValue([]),
}));

// Mock playback coordinator to prevent redis client lock dependencies
vi.mock("../modules/playback/playback.coordinator.js", () => ({
  skipTrack: vi.fn().mockResolvedValue({ status: "stopped" }),
  getPlaybackState: vi.fn().mockResolvedValue({ status: "stopped" }),
  destroyAllTimers: vi.fn(),
  emitResync: vi.fn(),
}));

const db = {
  rooms: new Map<string, Room>(),
  sessions: new Map<string, RoomSession>(),
  claims: new Map<string, NicknameClaim>(),
};

function clearDb() {
  db.rooms.clear();
  db.sessions.clear();
  db.claims.clear();
}

function extractCookie(cookieHeader: string | string[] | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const headers = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
  for (const h of headers) {
    const match = h.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(
    createConfigPlugin({
      databaseUrl: "postgresql://test:test@localhost:5432/test",
      redisUrl: "redis://localhost:6379",
      sessionSecret: "test-secret-for-testing-only-1234567890",
      corsOrigins: ["http://localhost:3000"],
      youtubeApiKey: null,
      port: 3000,
      host: "0.0.0.0",
      nodeEnv: "test",
    }),
  );
  app.register(cookie);
  app.register(authPlugin);

  app.decorate("redis", {
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
    duplicate: vi.fn().mockReturnValue({ quit: vi.fn().mockResolvedValue(undefined) }),
  } as never);

  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server;
  app.decorate("io", mockIo);

  app.decorate("prisma", {
    room: {
      create: vi.fn().mockImplementation(async (args: Prisma.RoomCreateArgs) => {
        const data = args.data;
        const room: Room = {
          id: randomUUID(),
          slug: data.slug,
          name: data.name,
          description: data.description ?? null,
          playlistMechanic: data.playlistMechanic ?? "fifo",
          visibility: data.visibility ?? "private_link",
          maxSongDurationSeconds: data.maxSongDurationSeconds ?? 600,
          duplicatePolicy: data.duplicatePolicy ?? "block_queue",
          roomPasswordHash: data.roomPasswordHash ?? null,
          hostSecretHash: data.hostSecretHash,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActiveAt: new Date(),
          expiresAt: null,
          queueLocked: false,
          chatLocked: false,
          listenerChatVisible: false,
          skipVoteThresholdType: "percentage",
          skipVoteThresholdValue: 50,
        };
        db.rooms.set(room.id, room);
        return room;
      }),
      findFirst: vi.fn().mockImplementation(async (args: Prisma.RoomFindFirstArgs) => {
        const where = args.where;
        if (!where) return null;
        for (const room of db.rooms.values()) {
          if (where.slug && typeof where.slug === "string" && room.slug === where.slug) return room;
          if (where.id && typeof where.id === "string" && room.id === where.id) return room;
          if (where.OR && Array.isArray(where.OR)) {
            for (const cond of where.OR) {
              if (cond.id && typeof cond.id === "string" && room.id === cond.id) return room;
              if (cond.slug && typeof cond.slug === "string" && room.slug === cond.slug) return room;
            }
          }
        }
        return null;
      }),
      findUnique: vi.fn().mockImplementation(async (args: Prisma.RoomFindUniqueArgs) => {
        const id = args.where.id;
        if (typeof id !== "string") return null;
        return db.rooms.get(id) ?? null;
      }),
      update: vi.fn().mockImplementation(async (args: Prisma.RoomUpdateArgs) => {
        const id = args.where.id;
        if (typeof id !== "string") throw new Error("Invalid id");
        const room = db.rooms.get(id);
        if (!room) throw new Error("Room not found");
        const data = args.data as Partial<Room>;
        Object.assign(room, data);
        return room;
      }),
    },
    roomSession: {
      create: vi.fn().mockImplementation(async (args: Prisma.RoomSessionCreateArgs) => {
        const data = args.data;
        const session: RoomSession = {
          id: randomUUID(),
          roomId: data.roomId as string,
          nicknameClaimId: (data.nicknameClaimId as string | null) ?? null,
          normalizedNickname: (data.normalizedNickname as string | null) ?? null,
          displayNickname: (data.displayNickname as string | null) ?? null,
          accessTier: (data.accessTier as AccessTier) ?? AccessTier.listener,
          role: (data.role as Role) ?? Role.listener,
          sessionTokenHash: data.sessionTokenHash,
          isMuted: false,
          isBanned: false,
          joinedAt: new Date(),
          lastSeenAt: new Date(),
          leftAt: null,
        };
        db.sessions.set(session.id, session);
        return session;
      }),
      findUnique: vi.fn().mockImplementation(async (args: Prisma.RoomSessionFindUniqueArgs) => {
        const where = args.where;
        if (where.id && typeof where.id === "string") {
          return db.sessions.get(where.id) ?? null;
        }
        if (where.sessionTokenHash && typeof where.sessionTokenHash === "string") {
          for (const s of db.sessions.values()) {
            if (s.sessionTokenHash === where.sessionTokenHash) return s;
          }
        }
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async (args: Prisma.RoomSessionFindFirstArgs) => {
        const where = args.where;
        if (!where) return null;
        for (const s of db.sessions.values()) {
          if (where.roomId && typeof where.roomId === "string" && s.roomId !== where.roomId) continue;
          if (where.normalizedNickname && typeof where.normalizedNickname === "string" && s.normalizedNickname !== where.normalizedNickname) continue;
          if (where.leftAt === null && s.leftAt !== null) continue;
          return s;
        }
        return null;
      }),
      update: vi.fn().mockImplementation(async (args: Prisma.RoomSessionUpdateArgs) => {
        const id = args.where.id;
        if (typeof id !== "string") throw new Error("Invalid id");
        const session = db.sessions.get(id);
        if (!session) throw new Error("Session not found");
        const data = args.data as Partial<RoomSession>;
        Object.assign(session, data);
        return session;
      }),
    },
    nicknameClaim: {
      create: vi.fn().mockImplementation(async (args: Prisma.NicknameClaimCreateArgs) => {
        const data = args.data;
        const claim: NicknameClaim = {
          id: randomUUID(),
          normalizedNickname: data.normalizedNickname,
          displayNickname: data.displayNickname,
          passwordHash: data.passwordHash,
          status: (data.status as NicknameClaimStatus) ?? NicknameClaimStatus.active,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
        };
        db.claims.set(claim.id, claim);
        return claim;
      }),
      findFirst: vi.fn().mockImplementation(async (args: Prisma.NicknameClaimFindFirstArgs) => {
        const where = args.where;
        if (!where) return null;
        for (const c of db.claims.values()) {
          if (where.normalizedNickname && typeof where.normalizedNickname === "string" && c.normalizedNickname !== where.normalizedNickname) continue;
          if (where.status && typeof where.status === "string" && c.status !== where.status) continue;
          return c;
        }
        return null;
      }),
    },
    roomSettingsHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      create: vi.fn().mockResolvedValue({
        id: "msg-123",
        body: "hello",
        createdAt: new Date(),
        sender: null,
      }),
    },
  } as never);

  app.register(roomsRouter);
  app.register(sessionsRouter);
  app.register(nicknamesRouter);
  app.register(async (instance) => playbackRouter(instance, mockIo));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error, "test-request-id"));
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid request.",
          requestId: "test-request-id",
          retryable: false,
          retryAfterSeconds: null,
          details: error.flatten(),
        },
      });
    }
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong.",
        requestId: "test-request-id",
        retryable: true,
        retryAfterSeconds: null,
      },
    });
  });

  return app;
}

describe("Room Creator Lifecycle - Creator-as-Listener to Upgraded Host", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    clearDb();
    app = buildTestApp();
  });

  it("should enforce Listener restriction on settings and skip before join, then succeed after join upgrade to host", async () => {
    // 1. Create a room
    const createRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        name: "Lifecycle Room",
        playlistMechanic: "fifo",
        visibility: "private_link",
        maxSongDurationSeconds: 600,
        duplicatePolicy: "block_queue",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body) as { room: { id: string }; hostToken: string };
    const roomId = createBody.room.id;
    const hostTokenCookie = extractCookie(createRes.headers["set-cookie"], "host_token");
    expect(hostTokenCookie).toBeDefined();

    // 2. Listen to room (creator bootstraps as a Listener first)
    const listenRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/listen`,
      payload: {},
    });
    expect(listenRes.statusCode).toBe(201);
    const listenBody = JSON.parse(listenRes.body) as { session: { roomSessionId: string; accessTier: string; role: string } };
    const listenerSessionId = listenBody.session.roomSessionId;
    expect(listenBody.session.accessTier).toBe("listener");
    expect(listenBody.session.role).toBe("listener");

    const sessionTokenCookie = extractCookie(listenRes.headers["set-cookie"], "session_token");
    expect(sessionTokenCookie).toBeDefined();

    // 3. Rejects settings change (moderator action) before nickname authentication
    const settingsBefore = await app.inject({
      method: "PATCH",
      url: `/api/rooms/${roomId}/settings`,
      headers: {
        cookie: `session_token=${sessionTokenCookie}`,
      },
      payload: {
        settings: {
          queueLocked: true,
        },
      },
    });
    expect(settingsBefore.statusCode).toBe(403);
    const settingsBeforeBody = JSON.parse(settingsBefore.body) as { error: { code: string } };
    expect(settingsBeforeBody.error.code).toBe("LISTENER_READ_ONLY");

    // 4. Rejects skip playback (member action) before nickname authentication
    const skipBefore = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/playback/skip`,
      headers: {
        cookie: `session_token=${sessionTokenCookie}`,
      },
    });
    expect(skipBefore.statusCode).toBe(403);
    const skipBeforeBody = JSON.parse(skipBefore.body) as { error: { code: string } };
    expect(skipBeforeBody.error.code).toBe("LISTENER_READ_ONLY");

    // 5. Upgrade the Listener session in place to Member/Host using join router + host_token
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      headers: {
        cookie: `host_token=${hostTokenCookie}; session_token=${sessionTokenCookie}`,
      },
      payload: {
        listenerSessionId,
        displayNickname: "CreatorHost",
        nicknamePassword: "secure-creator-password",
      },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinBody = JSON.parse(joinRes.body) as { session: { accessTier: string; role: string }; websocketToken: string };
    expect(joinBody.session.accessTier).toBe("member");
    expect(joinBody.session.role).toBe("host");
    expect(joinBody.websocketToken).toBeDefined();

    // 6. Settings patch and skip playback succeed now that the session is upgraded
    const settingsAfter = await app.inject({
      method: "PATCH",
      url: `/api/rooms/${roomId}/settings`,
      headers: {
        cookie: `session_token=${sessionTokenCookie}`,
      },
      payload: {
        settings: {
          queueLocked: true,
        },
      },
    });
    expect(settingsAfter.statusCode).toBe(200);
    const settingsAfterBody = JSON.parse(settingsAfter.body) as { room: { queueLocked: boolean } };
    expect(settingsAfterBody.room.queueLocked).toBe(true);

    const skipAfter = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/playback/skip`,
      headers: {
        cookie: `session_token=${sessionTokenCookie}`,
      },
    });
    expect(skipAfter.statusCode).toBe(200);
  });

  it("should prevent non-host member from altering room settings (preventing client-side role spoofing)", async () => {
    // 1. Create a room
    const createRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        name: "Settings Room",
        playlistMechanic: "fifo",
        visibility: "private_link",
        maxSongDurationSeconds: 600,
        duplicatePolicy: "block_queue",
      },
    });
    const createBody = JSON.parse(createRes.body) as { room: { id: string } };
    const roomId = createBody.room.id;

    // 2. A regular member joins (creates a new member session)
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: {
        displayNickname: "RegularParticipant",
        nicknamePassword: "member-password-123",
      },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinBody = JSON.parse(joinRes.body) as { session: { accessTier: string; role: string } };
    expect(joinBody.session.accessTier).toBe("member");
    expect(joinBody.session.role).toBe("participant");

    const memberSessionToken = extractCookie(joinRes.headers["set-cookie"], "session_token");
    expect(memberSessionToken).toBeDefined();

    // 3. Regular member attempts settings update (moderator/host only) -> should be rejected
    const settingsRes = await app.inject({
      method: "PATCH",
      url: `/api/rooms/${roomId}/settings`,
      headers: {
        cookie: `session_token=${memberSessionToken}`,
      },
      payload: {
        settings: {
          queueLocked: true,
        },
      },
    });
    expect(settingsRes.statusCode).toBe(403);
    const settingsErrBody = JSON.parse(settingsRes.body) as { error: { code: string } };
    expect(settingsErrBody.error.code).toBe("MODERATOR_REQUIRED");
  });
});

describe("WebSocket / realtime privilege elevation", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    clearDb();
    app = buildTestApp();
  });

  it("enforces upgraded websocket token for elevated privileges", async () => {
    const roomId = randomUUID();
    const sessionId = randomUUID();

    // Populate mock DB to prevent "Join the room before chatting" from prisma checks inside sendChatMessage
    db.rooms.set(roomId, {
      id: roomId,
      slug: "realtime-room",
      name: "Realtime Room",
      description: null,
      playlistMechanic: "fifo",
      visibility: "private_link",
      maxSongDurationSeconds: 600,
      duplicatePolicy: "block_queue",
      roomPasswordHash: null,
      hostSecretHash: "any-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: null,
      queueLocked: false,
      chatLocked: false,
      listenerChatVisible: false,
      skipVoteThresholdType: "percentage",
      skipVoteThresholdValue: 50,
    });

    db.sessions.set(sessionId, {
      id: sessionId,
      roomId,
      nicknameClaimId: "claim-id",
      normalizedNickname: "chatter",
      displayNickname: "Chatter",
      accessTier: AccessTier.member,
      role: Role.participant,
      sessionTokenHash: "any-token-hash",
      isMuted: false,
      isBanned: false,
      joinedAt: new Date(),
      lastSeenAt: new Date(),
      leftAt: null,
    });

    // 1. Generate a websocket token for a listener session
    const listenerToken = signWsToken({
      roomId,
      sessionId,
      accessTier: "listener",
    });

    // 2. Validate listener connection
    const payloadListener = verifyWsToken(listenerToken);
    expect(payloadListener.accessTier).toBe("listener");

    // 3. Stale connection checks: socket.data.accessTier remains "listener"
    const emitMock = vi.fn();
    const onAnyCallbacks: Array<(eventName: string, event: ClientEvent) => Promise<void>> = [];

    const mockSocket = {
      data: { accessTier: "listener", roomId, sessionId },
      onAny: (cb: (eventName: string, event: ClientEvent) => Promise<void>) => {
        onAnyCallbacks.push(cb);
      },
      emit: emitMock,
    } as unknown as Socket;

    const mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as Server;

    // Register gateway handlers
    registerRoomHandlers(app, mockIo, mockSocket, roomId, sessionId);

    // Emit chat.send through the stale listener socket
    await onAnyCallbacks[0]!("chat.send", { type: "chat.send", body: "hello" });

    // Expect LISTENER_READ_ONLY error
    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({
        code: "LISTENER_READ_ONLY",
      })
    );

    // 4. Once upgraded to member, client obtains upgraded token
    const upgradedToken = signWsToken({
      roomId,
      sessionId,
      accessTier: "member",
    });

    const payloadUpgraded = verifyWsToken(upgradedToken);
    expect(payloadUpgraded.accessTier).toBe("member");

    // 5. Connect with new token -> socket.data.accessTier becomes "member"
    const emitMockUpgraded = vi.fn();
    const onAnyCallbacksUpgraded: Array<(eventName: string, event: ClientEvent) => Promise<void>> = [];

    const mockSocketUpgraded = {
      data: { accessTier: "member", roomId, sessionId },
      onAny: (cb: (eventName: string, event: ClientEvent) => Promise<void>) => {
        onAnyCallbacksUpgraded.push(cb);
      },
      emit: emitMockUpgraded,
    } as unknown as Socket;

    registerRoomHandlers(app, mockIo, mockSocketUpgraded, roomId, sessionId);

    // Emit chat.send through member socket
    await onAnyCallbacksUpgraded[0]!("chat.send", { type: "chat.send", body: "hello" });

    // Expect no error to have been emitted
    expect(emitMockUpgraded).not.toHaveBeenCalled();
  });
});
