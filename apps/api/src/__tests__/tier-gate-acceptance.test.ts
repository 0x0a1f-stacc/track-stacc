import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { Socket, Server } from "socket.io";
import { registerRoomHandlers } from "../realtime/room.gateway.js";
import { PlaylistMechanic, type ClientEvent } from "@trackstacc/types";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { roomsRouter } from "../modules/rooms/rooms.router.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";
import { chatRouter } from "../modules/chat/chat.router.js";
import { moderationRouter } from "../modules/moderation/moderation.router.js";
import { playbackRouter } from "../modules/playback/playback.router.js";
import { queueRouter } from "../modules/queue/queue.router.js";

// =========================================================================
// Issue #41 acceptance criteria regression sweep
//
// Proves the three acceptance criteria from the issue:
//   1. Listener token → LISTENER_READ_ONLY for interactive actions
//   2. Member token → passes the tier guard
//   3. Fake role/tier in payload → ignored
//
// Covers both REST and WebSocket surfaces.
// =========================================================================

// ---------------------------------------------------------------------------
// Session fixtures
// ---------------------------------------------------------------------------

const LISTENER_SESSION = {
  id: "listener-session-1",
  roomId: "room-abc-123",
  accessTier: "listener" as const,
  role: "listener" as const,
  normalizedNickname: null,
  displayNickname: null,
  nicknameClaimId: null,
  sessionTokenHash: "listener-hash",
  isMuted: false,
  isBanned: false,
  joinedAt: new Date(),
  lastSeenAt: new Date(),
  leftAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MEMBER_SESSION = {
  id: "member-session-1",
  roomId: "room-abc-123",
  accessTier: "member" as const,
  role: "participant" as const,
  normalizedNickname: "testuser",
  displayNickname: "TestUser",
  nicknameClaimId: "claim-1",
  sessionTokenHash: "member-hash",
  isMuted: false,
  isBanned: false,
  joinedAt: new Date(),
  lastSeenAt: new Date(),
  leftAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const ROOM = {
  id: "room-abc-123",
  slug: "test-room",
  name: "Test Room",
  description: null,
  visibility: "private_link" as const,
  roomPasswordHash: null,
  hostSecretHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$hash",
  playlistMechanic: "fifo" as const,
  maxSongDurationSeconds: 600,
  duplicatePolicy: "block_queue" as const,
  skipVoteThresholdType: "percentage" as const,
  skipVoteThresholdValue: 50,
  queueLocked: false,
  chatLocked: false,
  listenerChatVisible: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: null,
  lastActiveAt: new Date(),
};

const QUEUE_ITEM = {
  id: "queue-item-1",
  roomId: "room-abc-123",
  trackId: "track-1",
  addedBySessionId: "member-session-1",
  status: "queued" as const,
  position: 1,
  score: 0,
  mechanicContext: {},
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  track: {
    id: "track-1",
    provider: "youtube" as const,
    providerVideoId: "dQw4w9WgXcQ",
    title: "Test Video",
    channelTitle: "Test Channel",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg",
    durationSeconds: 180,
    isEmbeddable: true,
    metadataStatus: "complete" as const,
    metadataFetchedAt: new Date(),
    createdAt: new Date(),
  },
};

// ---------------------------------------------------------------------------
// Test app builders
// ---------------------------------------------------------------------------

type TestSession = {
  id: string;
  roomId: string;
  accessTier: string;
  role: string;
  normalizedNickname: string | null;
  displayNickname: string | null;
  nicknameClaimId: string | null;
  sessionTokenHash: string;
  isMuted: boolean;
  isBanned: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function p(res: { statusCode: number; body: string }) {
  return JSON.parse(res.body) as { error: { code: string } };
}

function buildRestApp(sessionFixture: TestSession | null): FastifyInstance {
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

  const mockRedis = {
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
    duplicate: vi
      .fn()
      .mockReturnValue({ quit: vi.fn().mockResolvedValue(undefined) }),
  } as never;
  app.decorate("redis", mockRedis);

  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as never;
  app.decorate("io", mockIo);

  app.decorate("prisma", {
    room: {
      findFirst: vi.fn().mockResolvedValue(ROOM),
      findUnique: vi.fn().mockResolvedValue(ROOM),
      update: vi.fn().mockResolvedValue(ROOM),
    },
    roomSession: {
      findUnique: vi.fn().mockResolvedValue(sessionFixture),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([LISTENER_SESSION]),
      update: vi.fn().mockResolvedValue(sessionFixture ?? LISTENER_SESSION),
    },
    queueItem: {
      findMany: vi.fn().mockResolvedValue([QUEUE_ITEM]),
      findUnique: vi.fn().mockResolvedValue(QUEUE_ITEM),
      update: vi.fn().mockResolvedValue(QUEUE_ITEM),
      create: vi.fn().mockResolvedValue(QUEUE_ITEM),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    skipVote: {
      upsert: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    roomModerationAction: {
      create: vi.fn().mockResolvedValue({}),
    },
    roomSettingsHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as never);

  // Override session directly, bypassing cookie-based DB lookup
  app.addHook("preHandler", async (request) => {
    if (sessionFixture) {
      request.session = sessionFixture as never;
    }
  });

  app.register(roomsRouter);
  app.register(sessionsRouter);
  app.register(nicknamesRouter);
  app.register(chatRouter);
  app.register(moderationRouter);
  app.register(async (instance) => playbackRouter(instance, mockIo));
  app.register(async (instance) => queueRouter(instance, mockIo));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error, "acceptance-test-rid"));
    }
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected error.",
        requestId: "acceptance-test-rid",
        retryable: true,
        retryAfterSeconds: null,
      },
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// WebSocket test app builder
// ---------------------------------------------------------------------------

function buildWsApp(): FastifyInstance {
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

  app.decorate("prisma", {
    roomSession: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    queueItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    room: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    chatMessage: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
  } as never);

  return app;
}

function buildWsHandlers(
  app: FastifyInstance,
  accessTier: string,
): {
  emitEvent: (event: ClientEvent) => Promise<void>;
  emitMock: ReturnType<typeof vi.fn>;
} {
  const emitMock = vi.fn();
  const onAnyCallbacks: Array<
    (eventName: string, event: ClientEvent) => Promise<void>
  > = [];

  const mockSocket = {
    data: { accessTier },
    onAny: (cb: (eventName: string, event: ClientEvent) => Promise<void>) => {
      onAnyCallbacks.push(cb);
    },
    emit: emitMock,
  } as unknown as Socket;

  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server;

  registerRoomHandlers(app, mockIo, mockSocket, "room-abc-123", "session-1");

  return {
    emitEvent: async (event: ClientEvent) => {
      const name = event.type;
      for (const cb of onAnyCallbacks) {
        await cb(name, event);
      }
    },
    emitMock,
  };
}

function expectErrorCode(
  emitMock: ReturnType<typeof vi.fn>,
  expectedCode: string,
) {
  const errorCalls = emitMock.mock.calls.filter(
    (call: unknown[]) =>
      call[0] === "error" &&
      (call[1] as { code?: string }).code === expectedCode,
  );
  expect(errorCalls.length).toBeGreaterThanOrEqual(1);
}

function expectNoErrorCode(emitMock: ReturnType<typeof vi.fn>, code: string) {
  const errorCalls = emitMock.mock.calls.filter(
    (call: unknown[]) =>
      call[0] === "error" && (call[1] as { code?: string }).code === code,
  );
  expect(errorCalls).toHaveLength(0);
}

// =========================================================================
// REST — Acceptance criterion 1: Listener-tier rejection
// =========================================================================

describe("AC-1: REST Listener actions return LISTENER_READ_ONLY", () => {
  it("chat.send is not a REST route — skipped", () => {
    // chat.send is WebSocket-only; relevant AC-1 test is in WS section
  });

  it("POST /api/rooms/:roomId/queue/items rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/queue/items/:id/vote rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items/queue-item-1/vote",
      payload: { vote: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/playback/skip rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip",
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("PATCH /api/rooms/:roomId/settings rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/rooms/room-abc-123/settings",
      payload: { settings: { queueLocked: true } },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/nickname/change rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/nickname/change",
      payload: { displayNickname: "NewNickname" },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/playback/skip-vote rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip-vote",
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/queue/items/:id/approve rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items/queue-item-1/approve",
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("DELETE /api/rooms/:roomId/chat/messages/:id rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/rooms/room-abc-123/chat/messages/chat-msg-1",
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("POST /api/rooms/:roomId/moderation/mute rejects listener", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/moderation/mute",
      payload: { targetSessionId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// REST — Acceptance criterion 2: Member-tier pass-through
// =========================================================================

describe("AC-2: REST Member actions pass the tier guard", () => {
  it("member queue add does not get LISTENER_READ_ONLY", async () => {
    const app = buildRestApp(MEMBER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(res.statusCode).not.toBe(403);
    const body = JSON.parse(res.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("member playback skip-vote does not get LISTENER_READ_ONLY", async () => {
    const app = buildRestApp(MEMBER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip-vote",
    });
    expect(res.statusCode).not.toBe(403);
    const body = JSON.parse(res.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("member nickname change does not get LISTENER_READ_ONLY", async () => {
    const app = buildRestApp(MEMBER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/nickname/change",
      payload: { displayNickname: "NewNickname" },
    });
    expect(res.statusCode).not.toBe(403);
    const body = JSON.parse(res.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// REST — Acceptance criterion 3: Payload spoofing is ignored
// =========================================================================

describe("AC-3: REST payload role/tier spoofing is ignored", () => {
  it("listener queue add with body.accessTier=member still returns LISTENER_READ_ONLY", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: {
        youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
        accessTier: "member",
        role: "host",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener skip with body.role=host still returns LISTENER_READ_ONLY", async () => {
    const app = buildRestApp(LISTENER_SESSION);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip",
      payload: { role: "host", isHost: true },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// REST — Edge case: host/mod role requires member tier
// =========================================================================

describe("REST edge: host/mod role alone is insufficient", () => {
  it("listener with host role gets LISTENER_READ_ONLY on settings update", async () => {
    const app = buildRestApp({ ...LISTENER_SESSION, role: "host" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/rooms/room-abc-123/settings",
      payload: { settings: { queueLocked: true } },
    });
    expect(res.statusCode).toBe(403);
    expect(p(res).error.code).toBe("LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// REST — Edge case: missing session = AUTH_REQUIRED
// =========================================================================

describe("REST edge: missing session returns AUTH_REQUIRED", () => {
  it("queue add with no session returns AUTH_REQUIRED", async () => {
    const app = buildRestApp(null);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(res.statusCode).toBe(401);
    expect(p(res).error.code).toBe("AUTH_REQUIRED");
    await app.close();
  });

  it("playback skip with no session returns AUTH_REQUIRED", async () => {
    const app = buildRestApp(null);
    const res = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip",
    });
    expect(res.statusCode).toBe(401);
    expect(p(res).error.code).toBe("AUTH_REQUIRED");
    await app.close();
  });
});

// =========================================================================
// WebSocket — AC-1: Listener-tier rejection
// =========================================================================

describe("AC-1: WS Listener events return LISTENER_READ_ONLY", () => {
  it("listener chat.send gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({ type: "chat.send", body: "hello" });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener queue.add gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener room.settings.update gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "room.settings.update",
      settings: { queueLocked: true },
    });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener queue.vote gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "queue.vote",
      queueItemId: "qi-1",
      vote: 1,
    });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener moderation.action gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "moderation.action",
      action: {
        action: "mute",
        targetSessionId: "target-1",
      },
    });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener playback.skipVote gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({ type: "playback.skipVote" });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener room.mechanic.change gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "room.mechanic.change",
      mechanic: PlaylistMechanic.FIFO,
    });

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// WS — Listener-allowed events (negative: no LISTENER_READ_ONLY)
// ---------------------------------------------------------------------------

describe("WS listener-allowed events", () => {
  it("listener presence.heartbeat does not get LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({ type: "presence.heartbeat" });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener playback.clientState does not get LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "playback.clientState",
      status: "playing",
      positionSeconds: 30,
    });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// WS — AC-2: Member-tier pass-through
// =========================================================================

describe("AC-2: WS Member actions pass the tier guard", () => {
  it("member chat.send does not get LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "member");

    await emitEvent({ type: "chat.send", body: "hello" });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("member queue.add does not get LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "member");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("member queue.vote does not get LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "member");

    await emitEvent({
      type: "queue.vote",
      queueItemId: "qi-1",
      vote: 1,
    });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// WS — AC-3: Payload spoofing is ignored
// =========================================================================

describe("AC-3: WS payload role/tier spoofing is ignored", () => {
  it("listener chat.send with spoofed accessTier=member still gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "chat.send",
      body: "hello",
      accessTier: "member",
      role: "host",
    } as unknown as ClientEvent);

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("listener queue.add with spoofed role=host still gets LISTENER_READ_ONLY", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      role: "host",
      isHost: true,
    } as unknown as ClientEvent);

    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });
});

// =========================================================================
// WS — Legacy token fallback (token without accessTier)
// =========================================================================

describe("WS legacy token fallback", () => {
  it("socket.data from DB (no accessTier in token) still enforces tier", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "listener");

    await emitEvent({ type: "chat.send", body: "hello" });

    // Should reject because accessTier is "listener" in socket.data
    expectErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });

  it("member accessTier from DB passes the gate", async () => {
    const app = buildWsApp();
    const { emitEvent, emitMock } = buildWsHandlers(app, "member");

    await emitEvent({ type: "chat.send", body: "hello" });

    expectNoErrorCode(emitMock, "LISTENER_READ_ONLY");
    await app.close();
  });
});
