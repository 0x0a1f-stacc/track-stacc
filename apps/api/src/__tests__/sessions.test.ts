import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";

import type { FastifyInstance } from "fastify";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";
import { verifyWsToken } from "../lib/tokens.js";

function buildTestApp(overrides?: {
  nodeEnv?: string;
  roomPasswordHash?: string | null;
  roomNotFound?: boolean;
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
    nodeEnv: overrides?.nodeEnv ?? "test",
  };
  app.register(createConfigPlugin(config));
  app.register(cookie);

  const mockRedis = {
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
  } as never;
  app.decorate("redis", mockRedis);

  const roomPasswordHash = overrides?.roomPasswordHash ?? null;
  const mockPrisma = {
    room: {
      findFirst: overrides?.roomNotFound
        ? vi.fn().mockResolvedValue(null)
        : vi.fn().mockResolvedValue({
            id: "room-abc-123",
            slug: "test-room",
            name: "Test Room",
            description: null,
            visibility: roomPasswordHash ? "password_protected" : "private_link",
            roomPasswordHash,
            hostSecretHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$hash",
            playlistMechanic: "fifo",
            maxSongDurationSeconds: 600,
            duplicatePolicy: "block_queue",
            skipVoteThresholdType: "percentage",
            skipVoteThresholdValue: 50,
            queueLocked: false,
            chatLocked: false,
            listenerChatVisible: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            expiresAt: null,
            lastActiveAt: new Date(),
          }),
    },
    roomSession: {
      create: vi.fn().mockResolvedValue({
        id: "session-xyz-789",
        roomId: "room-abc-123",
        accessTier: "listener",
        role: "listener",
        normalizedNickname: null,
        displayNickname: null,
        nicknameClaimId: null,
        sessionTokenHash: "hashed-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
  app.decorate("prisma", mockPrisma as never);

  app.register(sessionsRouter);

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

describe("POST /api/rooms/:roomId/listen", () => {
  it("returns 201 with listener session and WS token for non-password room", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown> | undefined;
    expect(session).toBeDefined();
    expect(session!.roomSessionId).toBe("session-xyz-789");
    expect(session!.accessTier).toBe("listener");
    expect(session!.role).toBe("listener");
    expect(body.websocketToken).toBeDefined();
    expect(typeof body.websocketToken).toBe("string");
    // No nickname fields in listener response
    expect(session!.displayNickname).toBeUndefined();
    expect(session!.normalizedNickname).toBeUndefined();
    expect(session!.protectedNickname).toBeUndefined();
    // WebSocket token contains listener tier
    const decoded = verifyWsToken(body.websocketToken as string);
    expect(decoded.accessTier).toBe("listener");
    expect(decoded.roomId).toBe("room-abc-123");
    expect(decoded.sessionId).toBe("session-xyz-789");
    await app.close();
  });

  it("sets session_token cookie with httpOnly/SameSite/Path", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
    });
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = setCookie as string;
    expect(cookieStr).toContain("session_token=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("SameSite=Lax");
    expect(cookieStr).toContain("Path=/");
    await app.close();
  });

  it("creates room session with null nickname fields", async () => {
    const app = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
    });
    const prismaClient = (
      app as unknown as {
        prisma: { roomSession: { create: ReturnType<typeof vi.fn> } };
      }
    ).prisma;
    const callArgs = prismaClient.roomSession.create.mock
      .calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    expect(callArgs).toBeDefined();
    expect(callArgs!.data.accessTier).toBe("listener");
    expect(callArgs!.data.role).toBe("listener");
    expect(callArgs!.data.normalizedNickname).toBeNull();
    expect(callArgs!.data.displayNickname).toBeNull();
    expect(callArgs!.data.nicknameClaimId).toBeNull();
    await app.close();
  });

  it("accepts room by UUID and slug", async () => {
    const app = buildTestApp();
    const uuidResponse = await app.inject({
      method: "POST",
      url: "/api/rooms/550e8400-e29b-41d4-a716-446655440000/listen",
      payload: {},
    });
    expect(uuidResponse.statusCode).toBe(201);

    const slugResponse = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
    });
    expect(slugResponse.statusCode).toBe(201);
    await app.close();
  });

  it("returns ROOM_PASSWORD_REQUIRED for password-protected room without password", async () => {
    const app = buildTestApp({
      roomPasswordHash:
        "$argon2id$v=19$m=65536,t=3,p=1$salt$hashedpasswordvalue",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("ROOM_PASSWORD_REQUIRED");
    await app.close();
  });

  it("returns ROOM_PASSWORD_INCORRECT for wrong password", async () => {
    const app = buildTestApp({
      roomPasswordHash:
        "$argon2id$v=19$m=65536,t=3,p=1$salt$hashedpasswordvalue",
    });
    // the mock argon2 verify will reject since we don't have real hashing
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: { roomPassword: "wrong-password" },
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("ROOM_PASSWORD_INCORRECT");
    await app.close();
  });

  it("returns ROOM_NOT_FOUND for non-existent room", async () => {
    const app = buildTestApp({ roomNotFound: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/nonexistent/listen",
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("ROOM_NOT_FOUND");
    await app.close();
  });
});

describe("GET /api/rooms/:roomId", () => {
  it("does not expose roomPasswordHash or hostSecretHash", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/test-room",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const room = body.room as Record<string, unknown> | undefined;
    expect(room).toBeDefined();
    expect(room!.roomPasswordHash).toBeUndefined();
    expect(room!.room_password_hash).toBeUndefined();
    expect(room!.hostSecretHash).toBeUndefined();
    expect(room!.host_secret_hash).toBeUndefined();
    await app.close();
  });

  it("returns public room metadata", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/rooms/test-room",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const room = body.room as Record<string, unknown> | undefined;
    expect(room).toBeDefined();
    expect(room!.id).toBe("room-abc-123");
    expect(room!.slug).toBe("test-room");
    expect(room!.name).toBe("Test Room");
    expect(room!.playlistMechanic).toBe("fifo");
    expect(room!.listenerChatVisible).toBe(false);
    await app.close();
  });
});
