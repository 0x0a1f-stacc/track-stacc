import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { verifyWsToken, hashToken, setSecret } from "../lib/tokens.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";
import authPlugin from "../plugins/auth.js";

setSecret("test-secret-for-testing-only-1234567890");

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
  app.register(authPlugin);

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
        leftAt: null,
        isBanned: false,
      }),
      findUnique: vi.fn().mockImplementation((args: { where: { sessionTokenHash: string } }) => {
        const hash = args.where.sessionTokenHash;
        if (hash === hashToken("valid-member-token")) {
          return Promise.resolve({
            id: "session-member-123",
            roomId: "room-abc-123",
            accessTier: "member",
            role: "participant",
            normalizedNickname: "alice",
            displayNickname: "Alice",
            nicknameClaimId: "claim-alice",
            sessionTokenHash: hash,
            isBanned: false,
            leftAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (hash === hashToken("valid-host-token")) {
          return Promise.resolve({
            id: "session-host-123",
            roomId: "room-abc-123",
            accessTier: "member",
            role: "host",
            normalizedNickname: "host",
            displayNickname: "Host",
            nicknameClaimId: "claim-host",
            sessionTokenHash: hash,
            isBanned: false,
            leftAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (hash === hashToken("banned-token")) {
          return Promise.resolve({
            id: "session-banned-123",
            roomId: "room-abc-123",
            accessTier: "member",
            role: "participant",
            normalizedNickname: "banned",
            displayNickname: "Banned",
            nicknameClaimId: "claim-banned",
            sessionTokenHash: hash,
            isBanned: true,
            leftAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (hash === hashToken("expired-token")) {
          return Promise.resolve({
            id: "session-expired-123",
            roomId: "room-abc-123",
            accessTier: "member",
            role: "participant",
            normalizedNickname: "expired",
            displayNickname: "Expired",
            nicknameClaimId: "claim-expired",
            sessionTokenHash: hash,
            isBanned: false,
            leftAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        if (hash === hashToken("other-room-token")) {
          return Promise.resolve({
            id: "session-other-123",
            roomId: "other-room-abc",
            accessTier: "member",
            role: "participant",
            normalizedNickname: "other",
            displayNickname: "Other",
            nicknameClaimId: "claim-other",
            sessionTokenHash: hash,
            isBanned: false,
            leftAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
        return Promise.resolve({
          id: args.where.id,
          roomId: "room-abc-123",
          accessTier: "member",
          role: args.where.id === "session-host-123" ? "host" : "participant",
          normalizedNickname: "rehydrated",
          displayNickname: "Rehydrated",
          nicknameClaimId: "claim-rehydrated",
          sessionTokenHash: "hashed-token",
          isBanned: false,
          leftAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        });
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

  it("returns 200 and rehydrates existing valid member session without creating a new session or rotating cookie", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      headers: {
        cookie: "session_token=valid-member-token",
      },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      session: {
        roomSessionId: string;
        accessTier: string;
        role: string;
      };
      websocketToken: string;
    };
    expect(body.session.roomSessionId).toBe("session-member-123");
    expect(body.session.accessTier).toBe("member");
    expect(body.session.role).toBe("participant");
    expect(body.websocketToken).toBeDefined();

    // Verify WebSocket token contains member tier
    const decoded = verifyWsToken(body.websocketToken);
    expect(decoded.accessTier).toBe("member");
    expect(decoded.sessionId).toBe("session-member-123");

    // Cookie should NOT be rotated (no set-cookie header)
    expect(response.headers["set-cookie"]).toBeUndefined();

    // Prisma update should be called, but not create
    const prismaClient = (
      app as unknown as {
        prisma: {
          roomSession: {
            create: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).prisma;
    expect(prismaClient.roomSession.create).not.toHaveBeenCalled();
    expect(prismaClient.roomSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-member-123" },
      })
    );
    await app.close();
  });

  it("returns 200 and preserves host authority when rehydrating a valid host session", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      headers: {
        cookie: "session_token=valid-host-token",
      },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      session: {
        roomSessionId: string;
        accessTier: string;
        role: string;
      };
      websocketToken: string;
    };
    expect(body.session.roomSessionId).toBe("session-host-123");
    expect(body.session.accessTier).toBe("member");
    expect(body.session.role).toBe("host");
    
    // Cookie should NOT be rotated
    expect(response.headers["set-cookie"]).toBeUndefined();
    await app.close();
  });

  it("falls back to creating a new Listener session and sets cookie if existing session is banned", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      headers: {
        cookie: "session_token=banned-token",
      },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as {
      session: {
        roomSessionId: string;
        accessTier: string;
        role: string;
      };
      websocketToken: string;
    };
    expect(body.session.roomSessionId).toBe("session-xyz-789");
    expect(body.session.accessTier).toBe("listener");

    // Cookie SHOULD be rotated/set
    expect(response.headers["set-cookie"]).toBeDefined();
    
    // Prisma create SHOULD be called
    const prismaClient = (
      app as unknown as {
        prisma: {
          roomSession: {
            create: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).prisma;
    expect(prismaClient.roomSession.create).toHaveBeenCalled();
    await app.close();
  });

  it("falls back to creating a new Listener session and sets cookie if existing session has left (expired)", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
      headers: {
        cookie: "session_token=expired-token",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as {
      session: {
        roomSessionId: string;
        accessTier: string;
        role: string;
      };
      websocketToken: string;
    };
    expect(body.session.roomSessionId).toBe("session-xyz-789");
    expect(body.session.accessTier).toBe("listener");

    // Cookie SHOULD be rotated/set
    expect(response.headers["set-cookie"]).toBeDefined();
    await app.close();
  });

  it("falls back to creating a new Listener session and sets cookie if existing session belongs to another room", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/listen",
      payload: {},
      headers: {
        cookie: "session_token=other-room-token",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as {
      session: {
        roomSessionId: string;
        accessTier: string;
        role: string;
      };
      websocketToken: string;
    };
    expect(body.session.roomSessionId).toBe("session-xyz-789");
    expect(body.session.accessTier).toBe("listener");

    // Cookie SHOULD be rotated/set
    expect(response.headers["set-cookie"]).toBeDefined();
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
