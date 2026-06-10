import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { roomsRouter } from "../modules/rooms/rooms.router.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";
import { chatRouter } from "../modules/chat/chat.router.js";
import { moderationRouter } from "../modules/moderation/moderation.router.js";
import { playbackRouter } from "../modules/playback/playback.router.js";
import { queueRouter } from "../modules/queue/queue.router.js";

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

const CHAT_MESSAGE = {
  id: "chat-msg-1",
  roomId: "room-abc-123",
  senderSessionId: "member-session-1",
  messageType: "user" as const,
  body: "Hello",
  metadata: {},
  deletedAt: null,
  deletedBySessionId: null,
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Test app builder
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

function buildTestApp(sessionFixture: TestSession | null): FastifyInstance {
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
  } as unknown as Server;
  app.decorate("io", mockIo);

  const mockRoomFindFirst = vi.fn().mockResolvedValue(ROOM);
  const mockRoomFindUnique = vi.fn().mockResolvedValue(ROOM);
  const mockRoomUpdate = vi.fn().mockResolvedValue(ROOM);

  const mockSessionFindUnique = vi.fn().mockResolvedValue(sessionFixture);
  const mockSessionFindFirst = vi.fn().mockResolvedValue(null);
  const mockSessionUpdate = vi
    .fn()
    .mockResolvedValue(sessionFixture ?? LISTENER_SESSION);
  const mockSessionFindMany = vi.fn().mockResolvedValue([LISTENER_SESSION]);

  const mockQueueItemFindMany = vi.fn().mockResolvedValue([QUEUE_ITEM]);
  const mockQueueItemFindUnique = vi.fn().mockResolvedValue(QUEUE_ITEM);
  const mockQueueItemUpdate = vi.fn().mockResolvedValue(QUEUE_ITEM);
  const mockQueueItemCreate = vi.fn().mockResolvedValue(QUEUE_ITEM);

  const mockChatMessageFindMany = vi.fn().mockResolvedValue([CHAT_MESSAGE]);
  const mockChatMessageUpdate = vi.fn().mockResolvedValue(CHAT_MESSAGE);

  const mockSkipVoteUpsert = vi.fn().mockResolvedValue({});
  const mockSkipVoteCount = vi.fn().mockResolvedValue(0);

  const mockModerationActionCreate = vi.fn().mockResolvedValue({});

  const mockSettingsHistoryCreate = vi.fn().mockResolvedValue({});

  app.decorate("prisma", {
    room: {
      findFirst: mockRoomFindFirst,
      findUnique: mockRoomFindUnique,
      update: mockRoomUpdate,
    },
    roomSession: {
      findUnique: mockSessionFindUnique,
      findFirst: mockSessionFindFirst,
      findMany: mockSessionFindMany,
      update: mockSessionUpdate,
    },
    queueItem: {
      findMany: mockQueueItemFindMany,
      findUnique: mockQueueItemFindUnique,
      update: mockQueueItemUpdate,
      create: mockQueueItemCreate,
    },
    chatMessage: {
      findMany: mockChatMessageFindMany,
      update: mockChatMessageUpdate,
    },
    skipVote: {
      upsert: mockSkipVoteUpsert,
      count: mockSkipVoteCount,
    },
    roomModerationAction: {
      create: mockModerationActionCreate,
    },
    roomSettingsHistory: {
      create: mockSettingsHistoryCreate,
    },
  } as never);

  // Override session by setting it directly via preHandler, bypassing the
  // auth plugin's cookie-based DB lookup so tests don't need real tokens.
  app.addHook("preHandler", async (request) => {
    if (sessionFixture) {
      request.session = sessionFixture as never;
    }
  });

  app.addHook("onClose", async () => {
    // No-op cleanup to avoid test warnings
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
        .send(toErrorResponse(error, "test-request-id"));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectListenerReadOnly(
  response: Awaited<ReturnType<FastifyInstance["inject"]>>,
) {
  expect(response.statusCode).toBe(403);
  const body = JSON.parse(response.body) as { error?: { code: string } };
  expect(body.error?.code).toBe("LISTENER_READ_ONLY");
}

function expectAuthRequired(
  response: Awaited<ReturnType<FastifyInstance["inject"]>>,
) {
  expect(response.statusCode).toBe(401);
  const body = JSON.parse(response.body) as { error?: { code: string } };
  expect(body.error?.code).toBe("AUTH_REQUIRED");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("REST tier gate — listener rejection", () => {
  describe("queue routes", () => {
    it("POST /api/rooms/:roomId/queue/items rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items",
        payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
      });
      expectListenerReadOnly(response);
      await app.close();
    });

    it("POST /api/rooms/:roomId/queue/items/:id/vote rejects listener", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/queue-item-1/vote",
        payload: { vote: 1 },
      });
      expectListenerReadOnly(response);
      await app.close();
    });

    it("POST /api/rooms/:roomId/queue/items/:id/approve rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/queue-item-1/approve",
        payload: {},
      });
      // Must be LISTENER_READ_ONLY, not FORBIDDEN
      expectListenerReadOnly(response);
      await app.close();
    });

    it("POST /api/rooms/:roomId/queue/items/:id/reject rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/queue-item-1/reject",
        payload: {},
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });

  describe("playback routes", () => {
    it("POST /api/rooms/:roomId/playback/skip rejects listener", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/playback/skip",
      });
      expectListenerReadOnly(response);
      await app.close();
    });

    it("POST /api/rooms/:roomId/playback/skip-vote rejects listener", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/playback/skip-vote",
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });

  describe("room settings", () => {
    it("PATCH /api/rooms/:roomId/settings rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        payload: { settings: { queueLocked: true } },
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });

  describe("nickname change", () => {
    it("POST /api/rooms/:roomId/nickname/change rejects listener", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/nickname/change",
        payload: { displayNickname: "NewNickname" },
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });

  describe("chat moderation", () => {
    it("DELETE /api/rooms/:roomId/chat/messages/:id rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/rooms/room-abc-123/chat/messages/chat-msg-1",
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });

  describe("moderation actions", () => {
    it("POST /api/rooms/:roomId/moderation/mute rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/moderation/mute",
        payload: { targetSessionId: "00000000-0000-0000-0000-000000000000" },
      });
      expectListenerReadOnly(response);
      await app.close();
    });

    it("POST /api/rooms/:roomId/moderation/ban rejects listener with LISTENER_READ_ONLY", async () => {
      const app = buildTestApp(LISTENER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/moderation/ban",
        payload: { targetSessionId: "00000000-0000-0000-0000-000000000000" },
      });
      expectListenerReadOnly(response);
      await app.close();
    });
  });
});

// ---------------------------------------------------------------------------
// Member pass-through
// ---------------------------------------------------------------------------

describe("REST tier gate — member pass-through", () => {
  it("member session does not get LISTENER_READ_ONLY on queue add", async () => {
    const app = buildTestApp(MEMBER_SESSION);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(response.statusCode).not.toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("member session does not get LISTENER_READ_ONLY on playback skip-vote", async () => {
    const app = buildTestApp(MEMBER_SESSION);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip-vote",
    });
    expect(response.statusCode).not.toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });

  it("member session does not get LISTENER_READ_ONLY on nickname change", async () => {
    const app = buildTestApp(MEMBER_SESSION);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/nickname/change",
      payload: { displayNickname: "NewNickname" },
    });
    expect(response.statusCode).not.toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("LISTENER_READ_ONLY");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Payload spoofing — server must ignore client-supplied role/tier
// ---------------------------------------------------------------------------

describe("REST tier gate — payload spoofing rejected", () => {
  it("listener queue add with body.accessTier=member still returns LISTENER_READ_ONLY", async () => {
    const app = buildTestApp(LISTENER_SESSION);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: {
        youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
        accessTier: "member",
        role: "host",
      },
    });
    expectListenerReadOnly(response);
    await app.close();
  });

  it("listener playback skip with body.role=host still returns LISTENER_READ_ONLY", async () => {
    const app = buildTestApp(LISTENER_SESSION);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip",
      payload: { role: "host", isHost: true },
    });
    expectListenerReadOnly(response);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Missing session
// ---------------------------------------------------------------------------

describe("REST tier gate — missing session", () => {
  it("queue add with no session returns AUTH_REQUIRED", async () => {
    const app = buildTestApp(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/queue/items",
      payload: { youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expectAuthRequired(response);
    await app.close();
  });

  it("playback skip with no session returns AUTH_REQUIRED", async () => {
    const app = buildTestApp(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/room-abc-123/playback/skip",
    });
    expectAuthRequired(response);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Host/mod role requires member tier
// ---------------------------------------------------------------------------

describe("REST tier gate — host/mod role requires member tier", () => {
  it("listener with host role still gets LISTENER_READ_ONLY on settings update", async () => {
    const listenerWithHostRole = { ...LISTENER_SESSION, role: "host" as const };
    const app = buildTestApp(listenerWithHostRole);
    const response = await app.inject({
      method: "PATCH",
      url: "/api/rooms/room-abc-123/settings",
      payload: { settings: { queueLocked: true } },
    });
    expectListenerReadOnly(response);
    await app.close();
  });
});
