import cookie from "@fastify/cookie";
import type { Room, RoomSession, ChatMessage } from "@prisma/client";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { chatRouter } from "../modules/chat/chat.router.js";
import authPlugin from "../plugins/auth.js";

interface MappedChatMessage {
  id: string;
  roomId: string;
  senderSessionId: string | null;
  senderNickname: string | null;
  type: string;
  body: string;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
}

interface TestMessagesResponse {
  messages: MappedChatMessage[];
}

interface TestErrorResponse {
  error: {
    code: string;
  };
}

function buildTestApp(overrides?: {
  session?: Partial<RoomSession> | null;
  room?: Partial<Room>;
  messages?: Array<Partial<ChatMessage> & { sender?: { displayNickname: string | null } | null }>;
}): FastifyInstance {
  const app = Fastify({ logger: false });

  const config = {
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    redisUrl: "redis://localhost:6379",
    sessionSecret: "test-secret-for-testing-only-1234567890",
    corsOrigins: ["http://localhost:3000"],
    youtubeApiKey: null as string | null,
    port: 3000,
    host: "0.0.0.0",
    nodeEnv: "test",
  };
  app.register(createConfigPlugin(config));
  app.register(cookie);
  app.register(authPlugin);

  const mockSession = overrides?.session !== undefined ? overrides.session : {
    id: "session-xyz",
    roomId: "room-abc",
    accessTier: "member",
    role: "participant",
    displayNickname: "Chatter",
  };

  const mockRoom = overrides?.room !== undefined ? overrides.room : {
    id: "room-abc",
    slug: "test-room",
    name: "Test Room",
    listenerChatVisible: false,
  };

  const mockMessages = overrides?.messages !== undefined ? overrides.messages : [
    {
      id: "msg-1",
      roomId: "room-abc",
      senderSessionId: "session-xyz",
      messageType: "user",
      body: "Hello world!",
      metadata: {},
      deletedAt: null,
      createdAt: new Date(),
      sender: {
        displayNickname: "Chatter",
      },
    },
    {
      id: "msg-2",
      roomId: "room-abc",
      senderSessionId: null,
      messageType: "system",
      body: "System alert!",
      metadata: {},
      deletedAt: null,
      createdAt: new Date(),
      sender: null,
    },
  ];

  const mockPrisma = {
    roomSession: {
      findUnique: vi.fn().mockResolvedValue(mockSession),
    },
    room: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(mockRoom),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue(mockMessages),
    },
  };
  app.decorate("prisma", mockPrisma as never);

  app.register(chatRouter);

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

describe("GET /api/rooms/:roomId/chat/messages", () => {
  it("rejects request if no session exists", async () => {
    const app = buildTestApp({ session: null });

    const res = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc/chat/messages",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as TestErrorResponse;
    expect(body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects request if session room does not match requested room", async () => {
    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "different-room",
        accessTier: "member",
        role: "participant",
        displayNickname: "Chatter",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc/chat/messages",
      cookies: { session_token: "test-token" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as TestErrorResponse;
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns mapped messages with resolved senderNickname for members", async () => {
    const app = buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc/chat/messages",
      cookies: { session_token: "test-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TestMessagesResponse;
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.senderNickname).toBe("Chatter");
    expect(body.messages[1]?.senderNickname).toBeNull();
  });

  it("returns empty array for listeners if listenerChatVisible is false", async () => {
    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "room-abc",
        accessTier: "listener",
        role: "listener",
        displayNickname: null,
      },
      room: {
        id: "room-abc",
        slug: "test-room",
        name: "Test Room",
        listenerChatVisible: false,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc/chat/messages",
      cookies: { session_token: "test-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TestMessagesResponse;
    expect(body.messages).toEqual([]);
  });

  it("returns messages for listeners if listenerChatVisible is true", async () => {
    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "room-abc",
        accessTier: "listener",
        role: "listener",
        displayNickname: null,
      },
      room: {
        id: "room-abc",
        slug: "test-room",
        name: "Test Room",
        listenerChatVisible: true,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/rooms/room-abc/chat/messages",
      cookies: { session_token: "test-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TestMessagesResponse;
    expect(body.messages).toHaveLength(2);
  });
});

describe("DELETE /api/rooms/:roomId/chat/messages/:messageId", () => {
  it("allows moderator to delete message in their own room", async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: "msg-1", body: "deleted" });
    const mockFindFirst = vi.fn().mockResolvedValue({ id: "msg-1", roomId: "room-abc" });

    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "room-abc",
        accessTier: "member",
        role: "moderator",
        displayNickname: "Mod",
      },
    });

    const mockPrisma = app.prisma as unknown as {
      chatMessage: {
        findFirst: typeof mockFindFirst;
        update: typeof mockUpdate;
      };
    };
    mockPrisma.chatMessage.findFirst = mockFindFirst;
    mockPrisma.chatMessage.update = mockUpdate;

    const res = await app.inject({
      method: "DELETE",
      url: "/api/rooms/room-abc/chat/messages/msg-1",
      cookies: { session_token: "test-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "msg-1", roomId: "room-abc" },
    });
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("blocks deleting a message from a different room (cross-room)", async () => {
    const mockUpdate = vi.fn();
    const mockFindFirst = vi.fn().mockResolvedValue(null);

    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "room-abc",
        accessTier: "member",
        role: "moderator",
        displayNickname: "Mod",
      },
    });

    const mockPrisma = app.prisma as unknown as {
      chatMessage: {
        findFirst: typeof mockFindFirst;
        update: typeof mockUpdate;
      };
    };
    mockPrisma.chatMessage.findFirst = mockFindFirst;
    mockPrisma.chatMessage.update = mockUpdate;

    const res = await app.inject({
      method: "DELETE",
      url: "/api/rooms/room-abc/chat/messages/msg-from-room-def",
      cookies: { session_token: "test-token" },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as TestErrorResponse;
    expect(body.error.code).toBe("CHAT_MESSAGE_NOT_FOUND");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("blocks deleting a message when session roomId does not match URL roomId", async () => {
    const mockUpdate = vi.fn();
    const mockFindFirst = vi.fn();

    const app = buildTestApp({
      session: {
        id: "session-xyz",
        roomId: "room-abc",
        accessTier: "member",
        role: "moderator",
        displayNickname: "Mod",
      },
    });

    const mockPrisma = app.prisma as unknown as {
      chatMessage: {
        findFirst: typeof mockFindFirst;
        update: typeof mockUpdate;
      };
    };
    mockPrisma.chatMessage.findFirst = mockFindFirst;
    mockPrisma.chatMessage.update = mockUpdate;

    const res = await app.inject({
      method: "DELETE",
      url: "/api/rooms/room-def/chat/messages/msg-1",
      cookies: { session_token: "test-token" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as TestErrorResponse;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
