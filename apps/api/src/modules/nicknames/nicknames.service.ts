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

function determineRole(
  hostToken: string | undefined,
  room: { hostSecretHash: string },
) {
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

    // Check per-room nickname uniqueness, excluding the current session
    await checkPerRoomNicknameUniqueness(
      app,
      room.id,
      normalized.normalizedNickname,
      listenerSessionId,
    );

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
  // Check per-room nickname uniqueness
  await checkPerRoomNicknameUniqueness(
    app,
    room.id,
    normalized.normalizedNickname,
  );

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
    claimId = existingClaim.id;
  } else {
    // Protect-and-join: new protected nickname
    if (!nicknamePassword)
      throw new AppError(
        "NICKNAME_PROTECTION_REQUIRED",
        "A password is required to protect a new nickname.",
        409,
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
