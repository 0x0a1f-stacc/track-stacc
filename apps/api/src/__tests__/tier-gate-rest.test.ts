import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { describe, it, expect, vi } from "vitest";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { chatRouter } from "../modules/chat/chat.router.js";
import { moderationRouter } from "../modules/moderation/moderation.router.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";
import { playbackRouter } from "../modules/playback/playback.router.js";
import { queueRouter } from "../modules/queue/queue.router.js";
import { roomsRouter } from "../modules/rooms/rooms.router.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";

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

function buildTestApp(
  sessionFixture: TestSession | null,
  overrides?: {
    room?: Partial<typeof ROOM>;
    messages?: Array<
      Omit<Partial<typeof CHAT_MESSAGE>, "deletedAt"> & {
        deletedAt?: Date | null;
        sender?: { displayNickname: string | null } | null;
      }
    >;
  },
): FastifyInstance {
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

  const currentRoom = overrides?.room ? { ...ROOM, ...overrides.room } : { ...ROOM };
  const mockRoomFindFirst = vi.fn().mockResolvedValue(currentRoom);
  const mockRoomFindUnique = vi.fn().mockResolvedValue(currentRoom);
  const mockRoomUpdate = vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
    Object.assign(currentRoom, args.data);
    return currentRoom;
  });

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

  const currentMessages = overrides?.messages !== undefined ? overrides.messages : [CHAT_MESSAGE];
  const mockChatMessageFindMany = vi.fn().mockImplementation(async (args?: { where?: { roomId?: string; deletedAt?: null } }) => {
    const where = args?.where;
    return currentMessages.filter((msg) => {
      if (where) {
        if (where.roomId !== undefined && msg.roomId !== where.roomId) {
          return false;
        }
        if (where.deletedAt === null && msg.deletedAt !== null) {
          return false;
        }
      }
      return true;
    });
  });
  const mockChatMessageUpdate = vi.fn().mockResolvedValue(CHAT_MESSAGE);

  const mockSkipVoteUpsert = vi.fn().mockResolvedValue({});
  const mockSkipVoteCount = vi.fn().mockResolvedValue(0);

  const mockModerationActionCreate = vi.fn().mockResolvedValue({});

  const mockSettingsHistoryCreate = vi.fn().mockResolvedValue({});

  app.decorate("prisma", {
    room: {
      findFirst: mockRoomFindFirst,
      findUnique: mockRoomFindUnique,
      findUniqueOrThrow: mockRoomFindUnique,
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
      findUniqueOrThrow: mockQueueItemFindUnique,
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
    } else {
      const token = request.cookies.session_token;
      if (token === "host-token") {
        request.session = { ...MEMBER_SESSION, role: "host" } as never;
      } else if (token === "listener-token") {
        request.session = LISTENER_SESSION;
      }
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

    it("PATCH /api/rooms/:roomId/settings rejects non-host/non-moderator member with MODERATOR_REQUIRED", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        payload: { settings: { listenerChatVisible: true } },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error?: { code: string } };
      expect(body.error?.code).toBe("MODERATOR_REQUIRED");
      await app.close();
    });

    it("PATCH /api/rooms/:roomId/settings allows host to set listenerChatVisible to true", async () => {
      const hostSession = { ...MEMBER_SESSION, role: "host" as const };
      const app = buildTestApp(hostSession, { room: { listenerChatVisible: false } });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        payload: { settings: { listenerChatVisible: true } },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { room: { listenerChatVisible: boolean } };
      expect(body.room.listenerChatVisible).toBe(true);

      const prisma = app.prisma as unknown as {
        room: {
          update: {
            mock: {
              calls: Array<[{ data: { listenerChatVisible?: boolean } }]>;
            };
          };
        };
      };
      expect(prisma.room.update.mock.calls.length).toBeGreaterThan(0);
      const lastCall = prisma.room.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data.listenerChatVisible).toBe(true);
      await app.close();
    });

    it("PATCH /api/rooms/:roomId/settings allows host to set listenerChatVisible to false", async () => {
      const hostSession = { ...MEMBER_SESSION, role: "host" as const };
      const app = buildTestApp(hostSession, { room: { listenerChatVisible: true } });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        payload: { settings: { listenerChatVisible: false } },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { room: { listenerChatVisible: boolean } };
      expect(body.room.listenerChatVisible).toBe(false);

      const prisma = app.prisma as unknown as {
        room: {
          update: {
            mock: {
              calls: Array<[{ data: { listenerChatVisible?: boolean } }]>;
            };
          };
        };
      };
      expect(prisma.room.update.mock.calls.length).toBeGreaterThan(0);
      const lastCall = prisma.room.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data.listenerChatVisible).toBe(false);
      await app.close();
    });

    it("PATCH /api/rooms/:roomId/settings omitting listenerChatVisible does not change the stored value", async () => {
      const hostSession = { ...MEMBER_SESSION, role: "host" as const };
      const app = buildTestApp(hostSession, { room: { listenerChatVisible: true } });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        payload: { settings: { queueLocked: true } },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { room: { listenerChatVisible: boolean; queueLocked: boolean } };
      expect(body.room.listenerChatVisible).toBe(true);
      expect(body.room.queueLocked).toBe(true);

      const prisma = app.prisma as unknown as {
        room: {
          update: {
            mock: {
              calls: Array<[{ data: { listenerChatVisible?: boolean } }]>;
            };
          };
        };
      };
      const lastCall = prisma.room.update.mock.calls.at(-1)?.[0];
      expect(lastCall?.data.listenerChatVisible).toBeUndefined();
      await app.close();
    });

    it("restricts/allows chat-history reads for listener after host toggles listenerChatVisible", async () => {
      const app = buildTestApp(null, {
        room: { listenerChatVisible: false },
        messages: [
          {
            id: "msg-1",
            roomId: "room-abc-123",
            senderSessionId: "member-session-1",
            messageType: "user" as const,
            body: "Test Message",
            metadata: {},
            deletedAt: null,
            createdAt: new Date(),
            sender: { displayNickname: "Sender" },
          },
        ],
      });

      // 1. Get messages as listener when listenerChatVisible = false -> returns []
      const res1 = await app.inject({
        method: "GET",
        url: "/api/rooms/room-abc-123/chat/messages",
        cookies: { session_token: "listener-token" },
      });
      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body) as { messages: unknown[] };
      expect(body1.messages).toEqual([]);

      // 2. Toggle settings to true as host
      const res2 = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        cookies: { session_token: "host-token" },
        payload: { settings: { listenerChatVisible: true } },
      });
      expect(res2.statusCode).toBe(200);

      // 3. Get messages as listener when listenerChatVisible = true -> returns the message
      const res3 = await app.inject({
        method: "GET",
        url: "/api/rooms/room-abc-123/chat/messages",
        cookies: { session_token: "listener-token" },
      });
      expect(res3.statusCode).toBe(200);
      const body3 = JSON.parse(res3.body) as { messages: Array<{ id: string; body: string }> };
      expect(body3.messages).toHaveLength(1);
      expect(body3.messages[0]?.id).toBe("msg-1");
      expect(body3.messages[0]?.body).toBe("Test Message");

      // 4. Toggle settings to false as host again
      const res4 = await app.inject({
        method: "PATCH",
        url: "/api/rooms/room-abc-123/settings",
        cookies: { session_token: "host-token" },
        payload: { settings: { listenerChatVisible: false } },
      });
      expect(res4.statusCode).toBe(200);

      // 5. Get messages as listener when listenerChatVisible = false -> returns [] again
      const res5 = await app.inject({
        method: "GET",
        url: "/api/rooms/room-abc-123/chat/messages",
        cookies: { session_token: "listener-token" },
      });
      expect(res5.statusCode).toBe(200);
      const body5 = JSON.parse(res5.body) as { messages: unknown[] };
      expect(body5.messages).toEqual([]);

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

// ---------------------------------------------------------------------------
// Chat messages route access control
// ---------------------------------------------------------------------------

describe("GET /api/rooms/:roomId/chat/messages", () => {
  it("rejects anonymous client without session with 401 AUTH_REQUIRED", async () => {
    const app = buildTestApp(null);
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expectAuthRequired(response);
    await app.close();
  });

  it("rejects session from a different room with 403 FORBIDDEN", async () => {
    const sessionForDifferentRoom = { ...MEMBER_SESSION, roomId: "different-room" };
    const app = buildTestApp(sessionForDifferentRoom);
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
    await app.close();
  });

  it("returns empty array for listener when listenerChatVisible is false", async () => {
    const app = buildTestApp(LISTENER_SESSION, {
      room: { listenerChatVisible: false },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
    await app.close();
  });

  it("returns messages for listener when listenerChatVisible is true (excluding deleted and other rooms)", async () => {
    const mockMessages = [
      {
        id: "msg-valid",
        roomId: "room-abc-123",
        senderSessionId: "member-session-1",
        messageType: "user" as const,
        body: "Visible message",
        metadata: {},
        deletedAt: null,
        createdAt: new Date(),
        sender: { displayNickname: "Sender" },
      },
      {
        id: "msg-deleted",
        roomId: "room-abc-123",
        senderSessionId: "member-session-1",
        messageType: "user" as const,
        body: "Deleted message",
        metadata: {},
        deletedAt: new Date(),
        createdAt: new Date(),
        sender: { displayNickname: "Sender" },
      },
      {
        id: "msg-other-room",
        roomId: "other-room",
        senderSessionId: "member-session-1",
        messageType: "user" as const,
        body: "Other room message",
        metadata: {},
        deletedAt: null,
        createdAt: new Date(),
        sender: { displayNickname: "Sender" },
      },
    ];

    const app = buildTestApp(LISTENER_SESSION, {
      room: { listenerChatVisible: true },
      messages: mockMessages,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { messages: Array<{ id: string; body: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.id).toBe("msg-valid");
    expect(body.messages[0]?.body).toBe("Visible message");
    await app.close();
  });

  it("returns messages for member regardless of listenerChatVisible", async () => {
    const app = buildTestApp(MEMBER_SESSION, {
      room: { listenerChatVisible: false },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { messages: Array<{ body: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.body).toBe("Hello");
    await app.close();
  });

  it("returns messages for moderator regardless of listenerChatVisible", async () => {
    const moderatorSession = { ...MEMBER_SESSION, role: "moderator" as const };
    const app = buildTestApp(moderatorSession, {
      room: { listenerChatVisible: false },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { messages: Array<{ body: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.body).toBe("Hello");
    await app.close();
  });

  it("returns messages for host regardless of listenerChatVisible", async () => {
    const hostSession = { ...MEMBER_SESSION, role: "host" as const };
    const app = buildTestApp(hostSession, {
      room: { listenerChatVisible: false },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc-123/chat/messages",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { messages: Array<{ body: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.body).toBe("Hello");
    await app.close();
  });
});

describe("Cross-Room Resource Protection", () => {
  const HOST_SESSION = { ...MEMBER_SESSION, role: "host" as const };

  describe("Queue cross-room protection", () => {
    it("blocks DELETE queue item when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/rooms/different-room/queue/items/queue-item-1",
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks DELETE queue item when item belongs to a different room", async () => {
      const app = buildTestApp(HOST_SESSION);
      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockPrisma = app.prisma as unknown as {
        queueItem: {
          findFirst: typeof mockFindFirst;
        };
      };
      mockPrisma.queueItem.findFirst = mockFindFirst;

      const response = await app.inject({
        method: "DELETE",
        url: "/api/rooms/room-abc-123/queue/items/item-from-other-room",
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("QUEUE_ITEM_NOT_FOUND");
      await app.close();
    });

    it("blocks POST vote when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/queue/items/queue-item-1/vote",
        payload: { vote: 1 },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks POST vote when item belongs to a different room", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockPrisma = app.prisma as unknown as {
        queueItem: {
          findFirst: typeof mockFindFirst;
        };
      };
      mockPrisma.queueItem.findFirst = mockFindFirst;

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/item-from-other-room/vote",
        payload: { vote: 1 },
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("QUEUE_ITEM_NOT_FOUND");
      await app.close();
    });

    it("blocks POST approve suggestion when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(HOST_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/queue/items/queue-item-1/approve",
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks POST approve suggestion when item belongs to a different room", async () => {
      const app = buildTestApp(HOST_SESSION);
      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockPrisma = app.prisma as unknown as {
        queueItem: {
          findFirst: typeof mockFindFirst;
        };
      };
      mockPrisma.queueItem.findFirst = mockFindFirst;

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/item-from-other-room/approve",
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("QUEUE_ITEM_NOT_FOUND");
      await app.close();
    });

    it("blocks POST reject suggestion when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(HOST_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/queue/items/queue-item-1/reject",
        payload: { reason: "duplicate" },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks POST reject suggestion when item belongs to a different room", async () => {
      const app = buildTestApp(HOST_SESSION);
      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockPrisma = app.prisma as unknown as {
        queueItem: {
          findFirst: typeof mockFindFirst;
        };
      };
      mockPrisma.queueItem.findFirst = mockFindFirst;

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/queue/items/item-from-other-room/reject",
        payload: { reason: "duplicate" },
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("QUEUE_ITEM_NOT_FOUND");
      await app.close();
    });
  });

  describe("Moderation cross-room protection", () => {
    it("blocks moderation action when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(HOST_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/moderation/mute",
        payload: { targetSessionId: "00000000-0000-0000-0000-000000000000" },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks moderation action when target session belongs to a different room", async () => {
      const app = buildTestApp(HOST_SESSION);
      const mockFindFirst = vi.fn().mockResolvedValue(null);
      const mockPrisma = app.prisma as unknown as {
        roomSession: {
          findFirst: typeof mockFindFirst;
        };
      };
      mockPrisma.roomSession.findFirst = mockFindFirst;

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-abc-123/moderation/mute",
        payload: { targetSessionId: "00000000-0000-0000-0000-000000000001" },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe("Target session not found in this room.");
      await app.close();
    });
  });

  describe("Settings cross-room protection", () => {
    it("blocks patching settings when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(HOST_SESSION);
      const response = await app.inject({
        method: "PATCH",
        url: "/api/rooms/different-room/settings",
        payload: { settings: { queueLocked: true } },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });
  });

  describe("Playback cross-room protection", () => {
    it("blocks skip when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/playback/skip",
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });

    it("blocks skip-vote when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/playback/skip-vote",
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });
  });

  describe("Nickname change cross-room protection", () => {
    it("blocks nickname change when session roomId does not match URL roomId", async () => {
      const app = buildTestApp(MEMBER_SESSION);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/different-room/nickname/change",
        payload: { displayNickname: "NewName" },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
      await app.close();
    });
  });
});
