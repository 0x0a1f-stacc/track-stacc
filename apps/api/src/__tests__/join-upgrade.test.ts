import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";

import { verifyPassword } from "../lib/argon2.js";
import { createConfigPlugin } from "../lib/config.js";
import { AppError, toErrorResponse } from "../lib/errors.js";
import { verifyWsToken, setSecret } from "../lib/tokens.js";
import { nicknamesRouter } from "../modules/nicknames/nicknames.router.js";
import { determineRole } from "../modules/nicknames/nicknames.service.js";
import { sessionsRouter } from "../modules/sessions/sessions.router.js";

const MOCK_SECRET = "test-secret-for-join-upgrade-tests-32chars!";
setSecret(MOCK_SECRET);

vi.mock("../lib/argon2.js", () => ({
  hashPassword: vi
    .fn()
    .mockResolvedValue("$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash"),
  verifyPassword: vi
    .fn()
    .mockImplementation((_hash: string, password: string) =>
      Promise.resolve(password === "correct-password"),
    ),
}));

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const ROOM = {
  id: "room-abc-123",
  slug: "test-room",
  name: "Test Room",
  description: null,
  visibility: "private_link",
  roomPasswordHash: null,
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
};

const LISTENER_SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";
const DIFFERENT_ROOM_SESSION_ID = "223e4567-e89b-12d3-a456-426614174001";
const ALREADY_MEMBER_SESSION_ID = "323e4567-e89b-12d3-a456-426614174002";
const EXPIRED_SESSION_ID = "423e4567-e89b-12d3-a456-426614174003";

const ROOM_SESSION = {
  id: LISTENER_SESSION_ID,
  roomId: "room-abc-123",
  nicknameClaimId: null,
  normalizedNickname: null,
  displayNickname: null,
  accessTier: "listener",
  role: "listener",
  sessionTokenHash: "hashed-listener-token",
  isMuted: false,
  isBanned: false,
  joinedAt: new Date(),
  lastSeenAt: new Date(),
  leftAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

function buildTestApp(
  overrides?: {
    roomSessions?: Record<string, unknown>[];
    existingClaim?: Record<string, unknown> | null;
    bannedSessions?: Array<{
      roomId: string;
      nicknameClaimId?: string | null;
      normalizedNickname?: string | null;
      isBanned: boolean;
    }>;
    rateLimitExceeded?: boolean;
  },
  registerNicknames = true,
  registerSessions = true,
): FastifyInstance {
  const app = Fastify({ logger: false });

  const config = {
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    redisUrl: "redis://localhost:6379",
    sessionSecret: MOCK_SECRET,
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

  // Mock Socket.IO server
  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server;
  app.decorate("io", mockIo);

  // Mock prisma
  const claimToReturn = overrides?.existingClaim ?? null;
  const mockClaimFindFirst = vi
    .fn()
    .mockImplementation(
      (args: { where: { normalizedNickname: string; status: string } }) => {
        if (
          claimToReturn &&
          args.where.normalizedNickname === claimToReturn.normalizedNickname &&
          args.where.status === "active"
        ) {
          return Promise.resolve(claimToReturn);
        }
        return Promise.resolve(null);
      },
    );

  const mockSessionFindFirst = vi.fn().mockImplementation(
    (args: {
      where: {
        roomId?: string;
        nicknameClaimId?: string;
        normalizedNickname?: string;
        isBanned?: boolean;
        leftAt?: null;
        id?: { not: string };
      };
    }) => {
      if (args.where?.isBanned) {
        const bannedSession = overrides?.bannedSessions?.find((session) => {
          if (session.roomId !== args.where.roomId) return false;
          if (!session.isBanned) return false;
          if (
            args.where.nicknameClaimId &&
            session.nicknameClaimId === args.where.nicknameClaimId
          ) {
            return true;
          }
          if (
            args.where.normalizedNickname &&
            session.normalizedNickname === args.where.normalizedNickname
          ) {
            return true;
          }
          return false;
        });
        return Promise.resolve(bannedSession ?? null);
      }

      // Check for per-room nickname uniqueness
      if (args.where?.normalizedNickname) {
        // Simulate that "alice" is already taken in this room
        if (args.where.normalizedNickname === "alice" && !args.where.id) {
          return Promise.resolve(null); // Not taken in the default case
        }
        if (args.where.normalizedNickname === "bob") {
          return Promise.resolve({ id: "existing-bob-session" });
        }
      }
      return Promise.resolve(null);
    },
  );

  const mockSessionFindUnique = vi
    .fn()
    .mockImplementation((args: { where: { id: string } }) => {
      if (args.where.id === LISTENER_SESSION_ID) {
        return Promise.resolve(ROOM_SESSION);
      }
      if (args.where.id === DIFFERENT_ROOM_SESSION_ID) {
        return Promise.resolve({
          ...ROOM_SESSION,
          id: DIFFERENT_ROOM_SESSION_ID,
          roomId: "room-other",
        });
      }
      if (args.where.id === ALREADY_MEMBER_SESSION_ID) {
        return Promise.resolve({
          ...ROOM_SESSION,
          id: ALREADY_MEMBER_SESSION_ID,
          accessTier: "member",
          role: "participant",
        });
      }
      if (args.where.id === EXPIRED_SESSION_ID) {
        return Promise.resolve({
          ...ROOM_SESSION,
          id: EXPIRED_SESSION_ID,
          leftAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

  const mockSessionUpdate = vi
    .fn()
    .mockImplementation(
      (args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({
          ...ROOM_SESSION,
          id: args.where.id,
          ...args.data,
          updatedAt: new Date(),
        }),
    );

  const mockSessionCreate = vi
    .fn()
    .mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "new-member-session-789",
        roomId: "room-abc-123",
        nicknameClaimId: (args.data.nicknameClaimId as string | null) ?? null,
        normalizedNickname:
          (args.data.normalizedNickname as string | null) ?? null,
        displayNickname: (args.data.displayNickname as string | null) ?? null,
        accessTier: "member",
        role: (args.data.role as string | null) ?? "participant",
        sessionTokenHash: "new-hashed-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

  const mockClaimCreate = vi.fn().mockResolvedValue({
    id: "new-claim-999",
    normalizedNickname: "newuser",
    displayNickname: "NewUser",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$mockedhash",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
  });

  const mockSessionFindMany = vi
    .fn()
    .mockImplementation((args: { where: { roomId: string; leftAt: null } }) =>
      Promise.resolve([
        {
          ...ROOM_SESSION,
          id:
            args.where.roomId === "room-abc-123"
              ? LISTENER_SESSION_ID
              : "other-id",
        },
      ]),
    );

  app.decorate("prisma", {
    roomSession: {
      findFirst: mockSessionFindFirst,
      findUnique: mockSessionFindUnique,
      findMany: mockSessionFindMany,
      create: mockSessionCreate,
      update: mockSessionUpdate,
    },
    nicknameClaim: {
      findFirst: mockClaimFindFirst,
      create: mockClaimCreate,
    },
    room: {
      findFirst: vi.fn().mockResolvedValue(ROOM),
    },
  } as never);

  if (registerSessions) app.register(sessionsRouter);
  if (registerNicknames) app.register(nicknamesRouter);

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

// Store refs to the mocked prisma helpers for assertions
function getMockPrisma(app: FastifyInstance) {
  return app.prisma as unknown as {
    roomSession: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    nicknameClaim: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    room: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
}

function getMockIo(app: FastifyInstance) {
  return app.io as unknown as {
    to: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Tests: POST /api/rooms/:roomId/join — upgrade path (listenerSessionId)
// ---------------------------------------------------------------------------
describe("POST /api/rooms/:roomId/join — upgrade path", () => {
  it("upgrades a listener session to member with new nickname/password (protect-and-join)", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    // Same session continuity
    expect(session.roomSessionId).toBe(LISTENER_SESSION_ID);
    expect(session.accessTier).toBe("member");
    expect(session.displayNickname).toBe("NewUser");
    expect(session.role).toBe("participant");
    expect(session.protectedNickname).toBe(true);

    // WebSocket token carries member tier
    const decoded = verifyWsToken(body.websocketToken as string);
    expect(decoded.accessTier).toBe("member");
    expect(decoded.sessionId).toBe(LISTENER_SESSION_ID);
    expect(decoded.roomId).toBe("room-abc-123");

    // Prisma was called correctly: session UPDATE, NOT create
    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.update).toHaveBeenCalled();
    expect(prisma.roomSession.create).not.toHaveBeenCalled();

    // Nickname claim was created
    expect(prisma.nicknameClaim.create).toHaveBeenCalled();

    const updateCall = prisma.roomSession.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where.id).toBe(LISTENER_SESSION_ID);
    expect(updateCall.data.accessTier).toBe("member");
    expect(updateCall.data.role).toBe("participant");

    // Presence was broadcast
    const io = getMockIo(app);
    expect(io.to).toHaveBeenCalledWith("room:room-abc-123");
    expect(io.emit).toHaveBeenCalledWith(
      "presence.updated",
      expect.objectContaining({ type: "presence.updated" }),
    );

    await app.close();
  });

  it("upgrades a listener session with existing protected nickname and correct password", async () => {
    const app = buildTestApp({ existingClaim: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.roomSessionId).toBe(LISTENER_SESSION_ID);
    expect(session.accessTier).toBe("member");
    expect(session.displayNickname).toBe("Alice");
    expect(session.role).toBe("participant");
    expect(session.protectedNickname).toBe(true);

    const decoded = verifyWsToken(body.websocketToken as string);
    expect(decoded.accessTier).toBe("member");

    // Session was updated, not created
    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.update).toHaveBeenCalled();
    expect(prisma.roomSession.create).not.toHaveBeenCalled();

    // No new nickname claim was created (existing one was reused)
    const claimFindCalls = prisma.nicknameClaim.findFirst.mock.calls;
    expect(claimFindCalls.length).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("returns NICKNAME_PASSWORD_INCORRECT for wrong password on existing protected nickname", async () => {
    // Override argon2 mock for this test — wrong password
    const { verifyPassword } = await import("../lib/argon2.js");
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const app = buildTestApp({ existingClaim: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Alice",
        nicknamePassword: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_INCORRECT");

    // Session was NOT updated (still listener)
    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.update).not.toHaveBeenCalled();

    // Reset the mock
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (verifyPassword as ReturnType<typeof vi.fn>).mockImplementation(
      (_hash: string, password: string) =>
        Promise.resolve(password === "correct-password"),
    );

    await app.close();
  });

  it("returns NICKNAME_PASSWORD_RATE_LIMITED after too many failed attempts", async () => {
    const app = buildTestApp({
      existingClaim: CLAIM_ALICE,
      rateLimitExceeded: true,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Alice",
        nicknamePassword: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PASSWORD_RATE_LIMITED");

    await app.close();
  });

  it("returns NICKNAME_PROTECTED when an existing protected nickname needs a password (upgrade)", async () => {
    const app = buildTestApp({ existingClaim: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Alice",
        // no nicknamePassword
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PROTECTED");

    await app.close();
  });

  it("returns NICKNAME_PROTECTION_REQUIRED when a new nickname has no password", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "NewUser",
        // no nicknamePassword
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PROTECTION_REQUIRED");

    await app.close();
  });

  it("returns SESSION_INVALID for nonexistent listenerSessionId", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: "00000000-0000-0000-0000-000000000000", // Valid UUID format for nonexistent session
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("SESSION_INVALID");

    await app.close();
  });

  it("returns SESSION_INVALID for listener session from a different room", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: DIFFERENT_ROOM_SESSION_ID,
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("SESSION_INVALID");

    await app.close();
  });

  it("returns LISTENER_READ_ONLY for an already-member session", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: ALREADY_MEMBER_SESSION_ID,
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("LISTENER_READ_ONLY");

    await app.close();
  });

  it("returns SESSION_INVALID for an expired (leftAt) session", async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: EXPIRED_SESSION_ID,
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("SESSION_INVALID");

    await app.close();
  });

  it("returns NICKNAME_TAKEN when nickname is already active in the room by another session", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Bob",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_TAKEN");

    await app.close();
  });

  it("returns BANNED when upgrading into a nickname claim that is banned in the same room", async () => {
    const app = buildTestApp({
      existingClaim: CLAIM_ALICE,
      bannedSessions: [
        {
          roomId: "room-abc-123",
          nicknameClaimId: CLAIM_ALICE.id,
          normalizedNickname: "alice",
          isBanned: true,
        },
      ],
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as {
      error?: {
        code: string;
        requestId: string;
        retryable: boolean;
        retryAfterSeconds: number | null;
      };
    };
    expect(body.error?.code).toBe("BANNED");
    expect(body.error?.requestId).toBeTruthy();
    expect(typeof body.error?.retryable).toBe("boolean");

    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.update).not.toHaveBeenCalled();

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/rooms/:roomId/join — non-upgrade path (no listenerSessionId)
// ---------------------------------------------------------------------------
describe("POST /api/rooms/:roomId/join — non-upgrade path (backward compat)", () => {
  it("returns NICKNAME_PROTECTION_REQUIRED when no displayNickname is given", async () => {
    // Need a fresh app with a clean mock for this test
    const app = buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        // no displayNickname, no listenerSessionId
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PROTECTION_REQUIRED");

    await app.close();
  });

  it("creates a new member session when joining with unclaimed nickname (non-upgrade)", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.roomSessionId).toBe("new-member-session-789");
    expect(session.accessTier).toBe("member");
    expect(session.displayNickname).toBe("NewUser");
    expect(session.protectedNickname).toBe(true); // Nickname claim was created

    // Session was CREATED, not updated
    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.create).toHaveBeenCalled();
    expect(prisma.roomSession.update).not.toHaveBeenCalled();

    // Nickname claim was also created
    expect(prisma.nicknameClaim.create).toHaveBeenCalled();

    const decoded = verifyWsToken(body.websocketToken as string);
    expect(decoded.accessTier).toBe("member");

    await app.close();
  });

  it("returns NICKNAME_PROTECTION_REQUIRED when joining with new nickname without password (non-upgrade)", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "NewUser",
        // no nicknamePassword
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PROTECTION_REQUIRED");

    // No session was created
    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.create).not.toHaveBeenCalled();
    expect(prisma.nicknameClaim.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("creates a new member session when authenticating with existing protected nickname (non-upgrade)", async () => {
    const app = buildTestApp({ existingClaim: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.roomSessionId).toBe("new-member-session-789");
    expect(session.accessTier).toBe("member");
    expect(session.displayNickname).toBe("Alice");
    expect(session.role).toBe("participant");

    await app.close();
  });

  it("returns BANNED when the nickname claim has a banned session in the same room", async () => {
    const app = buildTestApp({
      existingClaim: CLAIM_ALICE,
      bannedSessions: [
        {
          roomId: "room-abc-123",
          nicknameClaimId: CLAIM_ALICE.id,
          normalizedNickname: "alice",
          isBanned: true,
        },
      ],
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as {
      error?: {
        code: string;
        requestId: string;
        retryable: boolean;
        retryAfterSeconds: number | null;
      };
    };
    expect(body.error?.code).toBe("BANNED");
    expect(body.error?.requestId).toBeTruthy();
    expect(typeof body.error?.retryable).toBe("boolean");

    const prisma = getMockPrisma(app);
    expect(prisma.roomSession.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("allows rejoining the same nickname in a different room", async () => {
    const app = buildTestApp({
      existingClaim: CLAIM_ALICE,
      bannedSessions: [
        {
          roomId: "other-room",
          nicknameClaimId: CLAIM_ALICE.id,
          normalizedNickname: "alice",
          isBanned: true,
        },
      ],
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;
    expect(session.roomSessionId).toBe("new-member-session-789");

    await app.close();
  });

  it("returns NICKNAME_PROTECTED when authenticating with existing protected nickname without password (non-upgrade)", async () => {
    const app = buildTestApp({ existingClaim: CLAIM_ALICE });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "Alice",
        // no nicknamePassword
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("NICKNAME_PROTECTED");

    await app.close();
  });

  it("returns ROOM_NOT_FOUND for nonexistent room", async () => {
    const app = buildTestApp();
    // Override room.findFirst to return null for this test
    const prisma = getMockPrisma(app);
    prisma.room.findFirst.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/nonexistent/join",
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { error?: { code: string } };
    expect(body.error?.code).toBe("ROOM_NOT_FOUND");

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Tests: listener session + socket.io presence broadcast
// ---------------------------------------------------------------------------
describe("join presence broadcast", () => {
  it("broadcasts presence.updated on successful join", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        listenerSessionId: LISTENER_SESSION_ID,
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(200);

    const io = getMockIo(app);
    expect(io.emit).toHaveBeenCalledWith(
      "presence.updated",
      expect.objectContaining({ type: "presence.updated" }),
    );

    await app.close();
  });

  it("also broadcasts presence.updated on non-upgrade join", async () => {
    const app = buildTestApp({ existingClaim: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "NewUser",
        nicknamePassword: "long-enough-pw",
      },
    });

    expect(response.statusCode).toBe(200);

    const io = getMockIo(app);
    expect(io.emit).toHaveBeenCalledWith(
      "presence.updated",
      expect.objectContaining({ type: "presence.updated" }),
    );

    await app.close();
  });
});

describe("determineRole unit tests", () => {
  const room = { hostSecretHash: "hashed-host-secret" };

  it("resolves to 'host' when hostToken is valid", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    const role = await determineRole("correct-password", room);
    expect(role).toBe("host");
    expect(verifyPassword).toHaveBeenCalledWith(
      "hashed-host-secret",
      "correct-password",
    );
  });

  it("resolves to 'participant' when hostToken is undefined", async () => {
    const role = await determineRole(undefined, room);
    expect(role).toBe("participant");
  });

  it("resolves to 'participant' when hostToken is invalid", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const role = await determineRole("wrong-password", room);
    expect(role).toBe("participant");
    expect(verifyPassword).toHaveBeenCalledWith(
      "hashed-host-secret",
      "wrong-password",
    );
  });

  it("resolves to 'participant' and fails safe if verifyPassword throws an error", async () => {
    vi.mocked(verifyPassword).mockRejectedValueOnce(new Error("Argon2 error"));
    const role = await determineRole("any-password", room);
    expect(role).toBe("participant");
  });
});

describe("join with host role integration", () => {
  it("joins as host when the host_token cookie matches the room host secret", async () => {
    // Mock verifyPassword: first call (nickname authentication) returns true,
    // second call (host token check) returns true.
    vi.mocked(verifyPassword)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const app = buildTestApp({ existingClaim: CLAIM_ALICE });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      headers: {
        cookie: "host_token=correct-password",
      },
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.role).toBe("host");
    expect(session.accessTier).toBe("member");

    await app.close();
  });

  it("joins as participant when host_token cookie is invalid", async () => {
    // Mock verifyPassword: first call (nickname authentication) returns true,
    // second call (host token check) returns false.
    vi.mocked(verifyPassword)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const app = buildTestApp({ existingClaim: CLAIM_ALICE });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      headers: {
        cookie: "host_token=wrong-password",
      },
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.role).toBe("participant");
    expect(session.accessTier).toBe("member");

    await app.close();
  });

  it("joins as participant when host_token cookie is missing", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const app = buildTestApp({ existingClaim: CLAIM_ALICE });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/test-room/join",
      payload: {
        displayNickname: "Alice",
        nicknamePassword: "correct-password",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const session = body.session as Record<string, unknown>;

    expect(session.role).toBe("participant");
    expect(session.accessTier).toBe("member");

    await app.close();
  });
});
