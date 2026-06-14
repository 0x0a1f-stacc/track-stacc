import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";

import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";

vi.mock("../lib/argon2.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash"),
  verifyPassword: vi.fn().mockImplementation(
    (_hash: string, password: string) => Promise.resolve(password === "correct-password"),
  ),
}));



const CLAIM_ALICE = {
  id: "claim-alice-123",
  normalizedNickname: "alice",
  displayNickname: "Alice",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null,
};

const CLAIM_BOB = {
  id: "claim-bob-456",
  normalizedNickname: "bob",
  displayNickname: "Bob",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null,
};

const CLAIM_LOCKED = {
  id: "claim-locked-789",
  normalizedNickname: "lockeduser",
  displayNickname: "LockedUser",
  passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
  status: "locked" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null,
};

interface BuildTestOverrides {
  findFirstResult?: Record<string, unknown> | null;
  findFirstImpl?: (args: {
    where: { normalizedNickname: string; status: string };
  }) => Promise<Record<string, unknown> | null>;
  createError?: Error;
  rateLimitExceeded?: boolean;
}

function buildTestApp(overrides?: BuildTestOverrides): FastifyInstance {
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
  const redisIncr = vi.fn().mockResolvedValue(rateLimitCount);
  const redisPexpire = vi.fn().mockResolvedValue(1);
  app.decorate("redis", {
    incr: redisIncr,
    pexpire: redisPexpire,
  } as never);

  const defaultFindFirstImpl = (args: {
    where: { normalizedNickname: string; status: string };
  }) => {
    if (args.where.status !== "active") {
      // Simulate that only active claims are returned
      if (args.where.normalizedNickname === "lockeduser") return Promise.resolve(null);
      if (args.where.normalizedNickname === "releaseduser") return Promise.resolve(null);
    }
    if (args.where.normalizedNickname === "alice") return Promise.resolve(CLAIM_ALICE);
    if (args.where.normalizedNickname === "bob") return Promise.resolve(CLAIM_BOB);
    if (args.where.normalizedNickname === "lockeduser" && args.where.status === "locked") {
      return Promise.resolve(CLAIM_LOCKED);
    }
    return Promise.resolve(null);
  };

  const nicknameClaimFindFirst =
    overrides?.findFirstImpl ?? overrides?.findFirstResult !== undefined
      ? vi.fn().mockResolvedValue(overrides.findFirstResult)
      : vi.fn().mockImplementation(defaultFindFirstImpl);

  const nicknameClaimCreate = overrides?.createError
    ? vi.fn().mockRejectedValue(overrides.createError)
    : vi.fn().mockImplementation(
        (args: { data: { normalizedNickname: string; displayNickname: string } }) =>
          Promise.resolve({
            id: "new-claim-999",
            normalizedNickname: args.data.normalizedNickname,
            displayNickname: args.data.displayNickname,
            passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          }),
      );

  app.decorate("prisma", {
    nicknameClaim: {
      findFirst: nicknameClaimFindFirst,
      create: nicknameClaimCreate,
    },
  } as never);

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

// ---------------------------------------------------------------------------
// POST /api/nicknames/check
// ---------------------------------------------------------------------------
describe("POST /api/nicknames/check", () => {
  it("returns normalized nickname and availability for an unclaimed name", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "Charlie" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("charlie");
    expect(body.protected).toBe(false);
    expect(body.available).toBe(true);
    await app.close();
  });

  it("trims whitespace, collapses internal space, and case-folds", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "  DJ  Fredo  " },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("dj fredo");
    await app.close();
  });

  it("preserves display casing in normalizedNickname (lowercased)", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "AliceInWonderland" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("aliceinwonderland");
    await app.close();
  });

  it("reports protected=true for an existing active claim", async () => {
    const app = buildTestApp();
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

  it("returns error for reserved name 'admin'", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "admin" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("RESERVED_NICKNAME");
    await app.close();
  });

  it("returns error for reserved name 'host'", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "host" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("RESERVED_NICKNAME");
    await app.close();
  });

  it("returns error for reserved confusable lookalike (Cyrillic 'admin')", async () => {
    const app = buildTestApp();
    // Cyrillic 'а' (U+0430) instead of Latin 'a'
    const cyrillicAdmin = "\u0430dmin";
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: cyrillicAdmin },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns error for control characters in nickname", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "bad\u0000name" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("INVALID_NICKNAME");
    await app.close();
  });

  it("returns error for too-short nickname (1 char)", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "a" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("INVALID_NICKNAME");
    await app.close();
  });

  it("returns error for too-long nickname (25 chars)", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "a".repeat(25) },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("INVALID_NICKNAME");
    await app.close();
  });

  it("returns error for special characters not in allowed set", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "hello@world" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("INVALID_NICKNAME");
    await app.close();
  });

  it("includes requestId in error response", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "" },
    });
    const body = JSON.parse(response.body) as { error?: { requestId: string } };
    expect(body.error?.requestId).toBe("test-request-id");
    await app.close();
  });

  it("accepts valid nickname with hyphens", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "cool-user_name" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("cool-user_name");
    await app.close();
  });

  it("accepts nickname with digits", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "User42" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("user42");
    await app.close();
  });

  it("normalizes unicode (NFKC)", async () => {
    const app = buildTestApp();
    // Full-width 'A' (U+FF21) should normalize to ASCII 'A'
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/check",
      payload: { displayNickname: "\uFF21lpha" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.normalizedNickname).toBe("alpha");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /api/nicknames/protect
// ---------------------------------------------------------------------------
describe("POST /api/nicknames/protect", () => {
  it("stores a new claim and returns id and displayNickname", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.id).toBe("new-claim-999");
    expect(body.displayNickname).toBe("Charlie");
    await app.close();
  });

  it("preserves display nickname casing in the response", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "AliceInWonderland", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.displayNickname).toBe("AliceInWonderland");
    await app.close();
  });

  it("does not return password or passwordHash in response", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "verystrongpassword" },
    });
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.password).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
    expect(body.password_hash).toBeUndefined();
    await app.close();
  });

  it("calls hashPassword with the plaintext password (stores hash, not plaintext)", async () => {
    const app = buildTestApp();
    const { hashPassword } = await import("../lib/argon2.js");
    await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "verystrongpassword" },
    });
    expect(hashPassword).toHaveBeenCalledWith("verystrongpassword");
    await app.close();
  });

  it("returns NICKNAME_TAKEN when nickname is already protected", async () => {
    const app = buildTestApp({ findFirstResult: CLAIM_ALICE });
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

  it("returns NICKNAME_TAKEN for case-folded duplicate", async () => {
    const app = buildTestApp({ findFirstResult: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "alice", password: "verystrongpassword" },
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
    const app = buildTestApp({ createError: prismaError });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "verystrongpassword" },
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
      payload: { displayNickname: "Charlie", password: "short" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("accepts password at exactly 10 characters", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Charlie", password: "tenletters" },
    });
    // "tenletters" is 10 chars — should succeed
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns VALIDATION_FAILED for password longer than 200 characters", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: {
        displayNickname: "Charlie",
        password: "a".repeat(201),
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("returns error for reserved nickname", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "admin", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("RESERVED_NICKNAME");
    await app.close();
  });

  it("returns error for reserved confusable lookalike", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "h\u043Est", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("includes error envelope fields (requestId, retryable) on failure", async () => {
    const app = buildTestApp({ findFirstResult: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/protect",
      payload: { displayNickname: "Alice", password: "verystrongpassword" },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("NICKNAME_TAKEN");
    expect(body.error.requestId).toBe("test-request-id");
    expect(body.error.retryable).toBe(false);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /api/nicknames/authenticate
// ---------------------------------------------------------------------------
describe("POST /api/nicknames/authenticate", () => {
  it("succeeds with correct password and returns claim metadata", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.authenticated).toBe(true);
    expect(body.id).toBe("claim-alice-123");
    expect(body.displayNickname).toBe("Alice");
    await app.close();
  });

  it("does not return passwordHash in success response", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.password).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
    expect(body.password_hash).toBeUndefined();
    await app.close();
  });

  it("calls verifyPassword with stored hash and provided password", async () => {
    const app = buildTestApp();
    const { verifyPassword } = await import("../lib/argon2.js");
    await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    expect(verifyPassword).toHaveBeenCalledWith(
      CLAIM_ALICE.passwordHash,
      "correct-password",
    );
    await app.close();
  });

  it("returns NICKNAME_PASSWORD_INCORRECT for wrong password", async () => {
    const app = buildTestApp();
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

  it("returns NICKNAME_PASSWORD_INCORRECT for an unknown nickname (no user enumeration)", async () => {
    const app = buildTestApp();
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
    const app = buildTestApp({ rateLimitExceeded: true });
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

  it("calls Redis incr for rate limiting on authenticate", async () => {
    const app = buildTestApp();
    const redis = (app as unknown as { redis: { incr: ReturnType<typeof vi.fn> } }).redis;
    await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "correct-password" },
    });
    expect(redis.incr).toHaveBeenCalledWith("rl:nickname-auth:alice");
    await app.close();
  });

  it("does not authenticate a locked claim", async () => {
    const app = buildTestApp({
      findFirstImpl: (args) => {
        // Only return the locked claim if status filter is "locked", otherwise null
        if (
          args.where.normalizedNickname === "lockeduser" &&
          args.where.status === "active"
        ) {
          return Promise.resolve(null);
        }
        if (
          args.where.normalizedNickname === "lockeduser" &&
          args.where.status === "locked"
        ) {
          return Promise.resolve(CLAIM_LOCKED);
        }
        if (args.where.normalizedNickname === "alice" && args.where.status === "active") {
          return Promise.resolve(CLAIM_ALICE);
        }
        return Promise.resolve(null);
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "lockeduser", password: "correct-password" },
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_INCORRECT");
    await app.close();
  });

  it("applies case-folding before lookup", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "ALICE", password: "correct-password" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.authenticated).toBe(true);
    expect(body.id).toBe("claim-alice-123");
    await app.close();
  });

  it("includes retryable in rate-limit error envelope", async () => {
    const app = buildTestApp({ rateLimitExceeded: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "wrong-password" },
    });
    const body = JSON.parse(response.body) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("NICKNAME_PASSWORD_RATE_LIMITED");
    expect(body.error.retryable).toBe(true);
    expect(body.error.requestId).toBe("test-request-id");
    await app.close();
  });

  it("returns VALIDATION_FAILED for password shorter than 10 characters", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/nicknames/authenticate",
      payload: { displayNickname: "Alice", password: "short" },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    await app.close();
  });
});
