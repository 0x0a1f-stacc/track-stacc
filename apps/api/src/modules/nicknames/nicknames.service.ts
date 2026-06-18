import type { FastifyInstance } from "fastify";

import { hashPassword, verifyPassword } from "../../lib/argon2.js";
import { AppError } from "../../lib/errors.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";
import { hashToken, randomToken, signWsToken } from "../../lib/tokens.js";
import { cleanupInactiveSessions } from "../../realtime/presence.manager.js";
import { normalizeNickname } from "../identity/nickname.normalizer.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checkNickname(
  app: FastifyInstance,
  displayNickname: string,
) {
  const normalized = normalizeNickname(displayNickname);
  const claim = await app.prisma.nicknameClaim.findFirst({
    where: {
      normalizedNickname: normalized.normalizedNickname,
      status: "active",
    },
  });
  return { ...normalized, protected: Boolean(claim) };
}

export async function protectNickname(
  app: FastifyInstance,
  displayNickname: string,
  password: string,
) {
  const normalized = normalizeNickname(displayNickname);
  const existing = await app.prisma.nicknameClaim.findFirst({
    where: {
      normalizedNickname: normalized.normalizedNickname,
      status: "active",
    },
  });
  if (existing) {
    throw new AppError(
      "NICKNAME_TAKEN",
      "That nickname is already protected.",
      409,
    );
  }
  const passwordHash = await hashPassword(password);
  try {
    return await app.prisma.nicknameClaim.create({
      data: { ...normalized, passwordHash, status: "active" },
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new AppError(
        "NICKNAME_TAKEN",
        "That nickname is already protected.",
        409,
      );
    }
    throw error;
  }
}

export interface JoinRoomInput {
  roomIdOrSlug: string;
  displayNickname?: string;
  nicknamePassword?: string;
  roomPassword?: string;
  hostToken?: string;
  listenerSessionId?: string;
}

export interface JoinRoomResult {
  session: {
    id: string;
    roomId: string;
    nicknameClaimId: string | null;
    displayNickname: string | null;
    normalizedNickname: string | null;
    accessTier: string;
    role: string;
    sessionTokenHash: string;
  };
  sessionToken: string;
  websocketToken: string;
}

async function resolveRoom(app: FastifyInstance, roomIdOrSlug: string) {
  const room = await app.prisma.room.findFirst({
    where: uuidPattern.test(roomIdOrSlug)
      ? { OR: [{ id: roomIdOrSlug }, { slug: roomIdOrSlug }] }
      : { slug: roomIdOrSlug },
  });
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
  return room;
}

async function verifyRoomPassword(
  room: { roomPasswordHash: string | null },
  roomPassword: string | undefined,
) {
  if (
    room.roomPasswordHash &&
    (!roomPassword ||
      !(await verifyPassword(room.roomPasswordHash, roomPassword)))
  )
    throw new AppError(
      "ROOM_PASSWORD_REQUIRED",
      "Room password is required.",
      401,
    );
}

async function findAndValidateListenerSession(
  app: FastifyInstance,
  listenerSessionId: string,
  roomId: string,
) {
  const session = await app.prisma.roomSession.findUnique({
    where: { id: listenerSessionId },
  });
  if (!session || session.leftAt)
    throw new AppError(
      "SESSION_INVALID",
      "Your room session expired. Please rejoin.",
      401,
    );
  if (session.roomId !== roomId)
    throw new AppError(
      "SESSION_INVALID",
      "This session does not belong to this room.",
      401,
    );
  if (session.accessTier !== "listener")
    throw new AppError(
      "LISTENER_READ_ONLY",
      "This session is already a member.",
      403,
    );
  return session;
}

async function handleExistingClaimAuth(
  app: FastifyInstance,
  claim: { id: string; passwordHash: string },
  nicknamePassword: string | undefined,
  normalizedNickname: string,
) {
  if (!nicknamePassword)
    throw new AppError(
      "NICKNAME_PROTECTED",
      "That nickname is protected. Enter its password.",
      409,
    );
  try {
    await assertRateLimit(
      app.redis,
      `rl:nickname-auth:${normalizedNickname}`,
      rateLimits.nicknameAuth.max,
      rateLimits.nicknameAuth.windowMs,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      throw new AppError(
        "NICKNAME_PASSWORD_RATE_LIMITED",
        "Too many incorrect attempts. Try again later.",
        429,
        undefined,
        true,
      );
    }
    throw error;
  }
  if (!(await verifyPassword(claim.passwordHash, nicknamePassword)))
    throw new AppError(
      "NICKNAME_PASSWORD_INCORRECT",
      "That nickname is protected. The password was incorrect.",
      403,
    );
}

async function checkPerRoomNicknameUniqueness(
  app: FastifyInstance,
  roomId: string,
  normalizedNickname: string,
  excludeSessionId?: string,
) {
  const where: {
    roomId: string;
    normalizedNickname: string;
    leftAt: null;
    id?: { not: string };
  } = {
    roomId,
    normalizedNickname,
    leftAt: null,
  };
  if (excludeSessionId) where.id = { not: excludeSessionId };
  const existing = await app.prisma.roomSession.findFirst({ where });
  if (existing)
    throw new AppError(
      "NICKNAME_TAKEN",
      "Someone is already using that nickname in this room.",
      409,
    );
}

async function assertNicknameNotBannedInRoom(
  app: FastifyInstance,
  roomId: string,
  normalizedNickname: string,
  nicknameClaimId?: string,
) {
  const bannedSession = await app.prisma.roomSession.findFirst({
    where: nicknameClaimId
      ? {
          roomId,
          nicknameClaimId,
          isBanned: true,
        }
      : {
          roomId,
          normalizedNickname,
          isBanned: true,
        },
  });

  if (bannedSession) {
    throw new AppError("BANNED", "You cannot participate in this room.", 403);
  }
}

/**
 * Resolves the role for a member room session.
 * 
 * Flow Details:
 * 1. Room Creation: Sets the cryptographically secure `host_token` cookie on the client.
 * 2. Room Bootstrap: When the creator enters the room via `POST /api/rooms/:roomId/listen`,
 *    the system is blind to the `host_token` and creates a default session with `accessTier: "listener"`
 *    and `role: "listener"`. The creator starts strictly as a read-only Listener.
 * 3. Nickname Authentication (Upgrade): To activate host authority, the creator must authenticate
 *    or claim a protected nickname by calling `POST /api/rooms/:roomId/join` (optionally passing `listenerSessionId`
 *    for in-place upgrades). This endpoint reads the `host_token` cookie and calls `determineRole()`.
 *    If the token matches the room's `hostSecretHash`, their role is upgraded to `"host"`.
 */
export function determineRole(
  hostToken: string | undefined,
  room: { hostSecretHash: string },
) {
  // NOTE: Room creation sets the `host_token` cookie and the `hostSecretHash` in the database.
  // When a user first connects or refreshes, calling POST /api/rooms/:roomId/listen always
  // produces a standard "listener" session (the system ignores hostToken at bootstrap).
  //
  // Host role activation only occurs during POST /api/rooms/:roomId/join (upgrade or join),
  // which verifies the hostToken against the room's hostSecretHash using determineRole().
  if (hostToken) {
    return verifyPassword(room.hostSecretHash, hostToken).then(
      (valid) => (valid ? ("host" as const) : ("participant" as const)),
      () => "participant" as const,
    );
  }
  return Promise.resolve("participant" as const);
}

function signMemberWsToken(roomId: string, sessionId: string) {
  return signWsToken({ roomId, sessionId, accessTier: "member" });
}

export async function joinRoom(
  app: FastifyInstance,
  input: JoinRoomInput,
): Promise<JoinRoomResult> {
  const {
    roomIdOrSlug,
    displayNickname,
    nicknamePassword,
    roomPassword,
    hostToken,
    listenerSessionId,
  } = input;

  // If no displayNickname is given, there is no viable protect/authenticate path.
  if (!displayNickname) {
    throw new AppError(
      "NICKNAME_PROTECTION_REQUIRED",
      "A protected nickname is required to participate in this room.",
      409,
    );
  }

  const room = await resolveRoom(app, roomIdOrSlug);
  await verifyRoomPassword(room, roomPassword);
  await cleanupInactiveSessions(app, room.id);
  const normalized = normalizeNickname(displayNickname);

  // -- Upgrade path: listenerSessionId provided --
  if (listenerSessionId) {
    // Validate the existing listener session (side effect: throws on invalid state)
    await findAndValidateListenerSession(app, listenerSessionId, room.id);

    // Look for an existing global nickname claim
    const existingClaim = await app.prisma.nicknameClaim.findFirst({
      where: {
        normalizedNickname: normalized.normalizedNickname,
        status: "active",
      },
    });

    let claimId: string | null = null;

    if (existingClaim) {
      // Authentication path: existing protected nickname
      if (!nicknamePassword) {
        throw new AppError(
          "NICKNAME_PROTECTED",
          "That nickname is protected. Enter its password.",
          409,
        );
      }
      await handleExistingClaimAuth(
        app,
        existingClaim,
        nicknamePassword,
        normalized.normalizedNickname,
      );
      await assertNicknameNotBannedInRoom(
        app,
        room.id,
        normalized.normalizedNickname,
        existingClaim.id,
      );
      claimId = existingClaim.id;
    } else {
      // Protect-and-join path: new nickname
      if (!nicknamePassword) {
        throw new AppError(
          "NICKNAME_PROTECTION_REQUIRED",
          "A password is required to protect a new nickname.",
          409,
        );
      }
      await assertNicknameNotBannedInRoom(
        app,
        room.id,
        normalized.normalizedNickname,
      );
      const passwordHash = await hashPassword(nicknamePassword);
      try {
        const newClaim = await app.prisma.nicknameClaim.create({
          data: {
            ...normalized,
            passwordHash,
            status: "active",
          },
        });
        claimId = newClaim.id;
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          throw new AppError(
            "NICKNAME_TAKEN",
            "That nickname is already protected.",
            409,
          );
        }
        throw error;
      }
    }

    // Check per-room nickname uniqueness, excluding the current session
    await checkPerRoomNicknameUniqueness(
      app,
      room.id,
      normalized.normalizedNickname,
      listenerSessionId,
    );

    // Resolves host role if the host_token cookie matches the room's hostSecretHash.
    // This transitions the user from read-only Listener to active Host.
    const role = await determineRole(hostToken, room);

    // Upgrade the existing session in-place
    const updatedSession = await app.prisma.roomSession.update({
      where: { id: listenerSessionId },
      data: {
        nicknameClaimId: claimId,
        normalizedNickname: normalized.normalizedNickname,
        displayNickname: normalized.displayNickname,
        accessTier: "member",
        role,
      },
    });

    return {
      session: updatedSession,
      sessionToken: "", // No cookie token rotation — existing cookie still identifies the same session row
      websocketToken: signMemberWsToken(room.id, updatedSession.id),
    };
  }

  // -- Non-upgrade path: no listenerSessionId --
  const existingClaim = await app.prisma.nicknameClaim.findFirst({
    where: {
      normalizedNickname: normalized.normalizedNickname,
      status: "active",
    },
  });

  let claimId: string | null = null;

  if (existingClaim) {
    // Authenticate against existing protected nickname
    if (!nicknamePassword)
      throw new AppError(
        "NICKNAME_PROTECTED",
        "That nickname is protected. Enter its password.",
        409,
      );
    await handleExistingClaimAuth(
      app,
      existingClaim,
      nicknamePassword,
      normalized.normalizedNickname,
    );
    await assertNicknameNotBannedInRoom(
      app,
      room.id,
      normalized.normalizedNickname,
      existingClaim.id,
    );
    claimId = existingClaim.id;
  } else {
    // Protect-and-join: new protected nickname
    if (!nicknamePassword)
      throw new AppError(
        "NICKNAME_PROTECTION_REQUIRED",
        "A password is required to protect a new nickname.",
        409,
      );
    await assertNicknameNotBannedInRoom(
      app,
      room.id,
      normalized.normalizedNickname,
    );
    const passwordHash = await hashPassword(nicknamePassword);
    try {
      const newClaim = await app.prisma.nicknameClaim.create({
        data: {
          ...normalized,
          passwordHash,
          status: "active",
        },
      });
      claimId = newClaim.id;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new AppError(
          "NICKNAME_TAKEN",
          "That nickname is already protected.",
          409,
        );
      }
      throw error;
    }
  }

  // Check per-room nickname uniqueness
  await checkPerRoomNicknameUniqueness(
    app,
    room.id,
    normalized.normalizedNickname,
  );

  // Resolves host role if the host_token cookie matches the room's hostSecretHash.
  // This transitions the user from read-only Listener to active Host.
  const role = await determineRole(hostToken, room);
  const sessionToken = randomToken();
  const session = await app.prisma.roomSession.create({
    data: {
      roomId: room.id,
      nicknameClaimId: claimId,
      ...normalized,
      accessTier: "member",
      role,
      sessionTokenHash: hashToken(sessionToken),
    },
  });

  return {
    session,
    sessionToken,
    websocketToken: signMemberWsToken(room.id, session.id),
  };
}
