import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";

import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { roomsRouter } from "../modules/rooms/rooms.router.js";

function buildTestApp(overrides?: {
  nodeEnv?: string;
  slug?: string;
  hostSecretHash?: string;
  prismaError?: Error;
  rateLimitEnabled?: boolean;
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

  const defaultSlug = overrides?.slug ?? `test-room-${Date.now()}`;
  const defaultHash =
    overrides?.hostSecretHash ??
    "$argon2id$v=19$m=65536,t=3,p=1$salt$hash";

  const mockRedis = {
    incr: vi
      .fn()
      .mockResolvedValue(overrides?.rateLimitEnabled ? 6 : 1),
    pexpire: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
  app.decorate("redis", mockRedis);

  const mockPrisma = {
    room: {
      create: overrides?.prismaError
        ? vi.fn().mockRejectedValue(overrides.prismaError)
        : vi.fn().mockResolvedValue({
            id: "room-123",
            slug: defaultSlug,
            name: "Untitled Room",
            description: null,
            visibility: "private_link",
            roomPasswordHash: null,
            hostSecretHash: defaultHash,
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
  };
  app.decorate("prisma", mockPrisma as never);

  app.register(roomsRouter);

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

describe("POST /api/rooms", () => {
  it("returns 201 with room and hostToken on minimal input", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const room = body.room as Record<string, unknown> | undefined;
    expect(room).toBeDefined();
    expect(room!.id).toBe("room-123");
    expect(room!.slug).toBeDefined();
    expect(typeof room!.slug).toBe("string");
    expect(room!.name).toBe("Untitled Room");
    expect(room!.playlistMechanic).toBe("fifo");
    expect(body.hostToken).toBeDefined();
    expect(typeof body.hostToken).toBe("string");
    await app.close();
  });

  it("sets host_token cookie with correct attributes", async () => {
    const app = buildTestApp({ nodeEnv: "test" });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookie = setCookie as string;
    expect(cookie).toContain("host_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    await app.close();
  });

  it("sets secure cookie flag only in production", async () => {
    const prodApp = buildTestApp({ nodeEnv: "production" });
    const testApp = buildTestApp({ nodeEnv: "test" });

    const prodResponse = await prodApp.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    const prodCookie = String(prodResponse.headers["set-cookie"]);
    expect(prodCookie).toContain("Secure");

    const testResponse = await testApp.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    const testCookie = String(testResponse.headers["set-cookie"]);
    expect(testCookie).not.toContain("Secure");

    await prodApp.close();
    await testApp.close();
  });

  it("accepts full valid input and returns 201", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        name: "Friday Night Aux",
        description: "A weekly room for friends",
        playlistMechanic: "voting",
        visibility: "public",
        maxSongDurationSeconds: 300,
        duplicatePolicy: "allow",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const room = body.room as Record<string, unknown> | undefined;
    expect(room).toBeDefined();
    expect(room!.name).toBe("Untitled Room"); // service always uses slugify output
    expect(room!.playlistMechanic).toBe("fifo");
    await app.close();
  });

  it("stores host secret as Argon2id hash", async () => {
    const app = buildTestApp();
    await app.inject({ method: "POST", url: "/api/rooms", payload: {} });
    const prismaClient = (app as unknown as { prisma: { room: { create: ReturnType<typeof vi.fn> } } }).prisma;
    const callArgs = prismaClient.room.create.mock.calls[0]?.[0] as { data: { hostSecretHash: string } } | undefined;
    expect(callArgs).toBeDefined();
    expect(callArgs!.data.hostSecretHash).toMatch(/^\$argon2id\$/);
    await app.close();
  });

  it("applies SDD defaults when settings omitted", async () => {
    const app = buildTestApp();
    await app.inject({ method: "POST", url: "/api/rooms", payload: {} });
    const prismaClient = (app as unknown as { prisma: { room: { create: ReturnType<typeof vi.fn> } } }).prisma;
    const callArgs = prismaClient.room.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    expect(callArgs).toBeDefined();
    // These defaults come from Zod schema defaults:
    expect(callArgs!.data.playlistMechanic).toBe("fifo");
    expect(callArgs!.data.visibility).toBe("private_link");
    expect(callArgs!.data.maxSongDurationSeconds).toBe(600);
    expect(callArgs!.data.duplicatePolicy).toBe("block_queue");
    // Room service sets name to "Untitled Room" when omitted
    expect(callArgs!.data.name).toBe("Untitled Room");
    // description defaults to null in service
    expect(callArgs!.data.description).toBeNull();
    // roomPasswordHash defaults to null when no password provided
    expect(callArgs!.data.roomPasswordHash).toBeNull();
    await app.close();
  });

  it("rejects name longer than 80 characters", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { name: "a".repeat(81) },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("rejects invalid playlistMechanic enum", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { playlistMechanic: "invalid" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("rate limits after 5 requests per hour", async () => {
    const app = buildTestApp({ rateLimitEnabled: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    // When rate limit is exceeded, assertRateLimit throws RATE_LIMITED (429)
    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("RATE_LIMITED");
    await app.close();
  });

  it("returns 500 on slug collision", async () => {
    const prismaError = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["slug"] },
    });
    const app = buildTestApp({ prismaError });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("INTERNAL_ERROR");
    await app.close();
  });
});
