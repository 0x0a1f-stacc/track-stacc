import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";

import type { FastifyInstance } from "fastify";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";

vi.mock("../lib/argon2.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash"),
  verifyPassword: vi.fn().mockImplementation(
    (_hash: string, password: string) => Promise.resolve(password === "correct-password"),
  ),
}));

import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";

const MOCK_CLAIM = {
  id: "claim-abc-123",
  normalizedNickname: "alice",
  displayNickname: "Alice",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null,
};

function buildTestApp(overrides?: {
  existingClaim?: boolean;
  createError?: Error;
  rateLimitExceeded?: boolean;
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

  const rateLimitCount = overrides?.rateLimitExceeded ? 10 : 1;
  const mockRedis = {
    incr: vi.fn().mockResolvedValue(rateLimitCount),
    pexpire: vi.fn().mockResolvedValue(1),
  } as never;
  app.decorate("redis", mockRedis);

  const nicknameClaimFindFirst = vi.fn().mockImplementation(
    (args: { where: { normalizedNickname: string; status: string } }) => {
      if (
        args.where.normalizedNickname === "alice" &&
        overrides?.existingClaim !== false
      ) {
        return Promise.resolve(MOCK_CLAIM);
      }
      if (args.where.normalizedNickname === "bob") {
        return Promise.resolve(MOCK_CLAIM);
      }
      return Promise.resolve(null);
    },
  );

  const nicknameClaimCreate = overrides?.createError
    ? vi.fn().mockRejectedValue(overrides.createError)
    : vi.fn().mockImplementation(
        (args: { data: { normalizedNickname: string; displayNickname: string } }) =>
          Promise.resolve({
            id: "new-claim-456",
            normalizedNickname: args.data.normalizedNickname,
            displayNickname: args.data.displayNickname,
            passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          }),
      );

  const mockPrisma = {
    nicknameClaim: {
      findFirst: nicknameClaimFindFirst,
      create: nicknameClaimCreate,
    },
  };
  app.decorate("prisma", mockPrisma as never);

  app.register(nicknamesRouter);

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
    app.log.error(error);
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

describe("POST /api/nicknames/check", () => {
  it("returns normalized nickname and availability for an unclaimed name", async () => {
    const app = buildTestApp({ existingClaim: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "  Alice  " },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("alice");
    expect(body.protected).toBe(false);
    expect(body.available).toBe(true);
    await app.close();
  });

  it("reports protected=true for an existing active claim", async () => {
    const app = buildTestApp({ existingClaim: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "Alice" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("alice");
    expect(body.protected).toBe(true);
    expect(body.available).toBe(true);
    await app.close();
  });

  it("returns VALIDATION_FAILED for empty nickname", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });
});

describe("POST /api/nicknames/protect", () => {
  it("stores a new claim and returns id and displayNickname", async () => {
    const app = buildTestApp({ existingClaim: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.id).toBe("new-claim-456");
    expect(body.displayNickname).toBe("Alice");
    await app.close();
  });

  it("does not return passwordHash in response", async () => {
    const app = buildTestApp({ existingClaim: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "verystrongpassword" },
    });
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.passwordHash).toBeUndefined();
    expect(body.password_hash).toBeUndefined();
    await app.close();
  });

  it("returns NICKNAME_TAKEN when nickname is already protected", async () => {
    const app = buildTestApp({ existingClaim: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_TAKEN");
    await app.close();
  });

  it("returns NICKNAME_TAKEN on Prisma P2002 unique constraint violation", async () => {
    const prismaError = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["normalized_nickname", "status"] },
    });
    const app = buildTestApp({ existingClaim: false, createError: prismaError });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_TAKEN");
    await app.close();
  });

  it("returns VALIDATION_FAILED for password shorter than 10 characters", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "short" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("stores a hash not a plaintext password", async () => {
    const app = buildTestApp({ existingClaim: false });
    const { hashPassword } = await import("../lib/argon2.js");
    await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "verystrongpassword" },
    });
    expect(hashPassword).toHaveBeenCalledWith("verystrongpassword");
    await app.close();
  });
});

describe("POST /api/nicknames/authenticate", () => {
  it("succeeds with correct password", async () => {
    const app = buildTestApp({ existingClaim: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.authenticated).toBe(true);
    expect(body.id).toBe("claim-abc-123");
    expect(body.displayNickname).toBe("Alice");
    await app.close();
  });

  it("does not return passwordHash in success response", async () => {
    const app = buildTestApp({ existingClaim: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.passwordHash).toBeUndefined();
    expect(body.password_hash).toBeUndefined();
    await app.close();
  });

  it("returns NICKNAME_PASSWORD_INCORRECT for wrong password", async () => {
    const app = buildTestApp({ existingClaim: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "wrong-password" },
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_INCORRECT");
    await app.close();
  });

  it("returns NICKNAME_PASSWORD_INCORRECT for an unknown nickname", async () => {
    const app = buildTestApp({ existingClaim: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "UnknownUser", password: "some-password" },
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_INCORRECT");
    await app.close();
  });

  it("returns NICKNAME_PASSWORD_RATE_LIMITED after repeated failed attempts", async () => {
    const app = buildTestApp({ existingClaim: true, rateLimitExceeded: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "wrong-password" },
    });
    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_RATE_LIMITED");
    await app.close();
  });
});
