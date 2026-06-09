import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/argon2.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";
import { hashToken, randomToken, signWsToken } from "../../lib/tokens.js";
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
  const passwordHash = await hashPassword(password);
  return app.prisma.nicknameClaim.create({
    data: { ...normalized, passwordHash, status: "active" },
  });
}

export async function joinRoom(
  app: FastifyInstance,
  roomIdOrSlug: string,
  displayNickname: string,
  nicknamePassword: string | undefined,
  roomPassword: string | undefined,
  hostToken?: string,
) {
  const room = await app.prisma.room.findFirst({
    where: uuidPattern.test(roomIdOrSlug)
      ? { OR: [{ id: roomIdOrSlug }, { slug: roomIdOrSlug }] }
      : { slug: roomIdOrSlug },
  });
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
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
  const normalized = normalizeNickname(displayNickname);
  const existingActive = await app.prisma.roomSession.findFirst({
    where: {
      roomId: room.id,
      normalizedNickname: normalized.normalizedNickname,
      leftAt: null,
    },
  });
  if (existingActive)
    throw new AppError(
      "NICKNAME_TAKEN",
      "Someone is already using that nickname in this room.",
      409,
    );
  const claim = await app.prisma.nicknameClaim.findFirst({
    where: {
      normalizedNickname: normalized.normalizedNickname,
      status: "active",
    },
  });
  if (claim) {
    if (!nicknamePassword)
      throw new AppError(
        "NICKNAME_PROTECTED",
        "That nickname is protected. Enter its password.",
        401,
      );
    await assertRateLimit(
      app.redis,
      `rl:nickname-auth:${normalized.normalizedNickname}`,
      rateLimits.nicknameAuth.max,
      rateLimits.nicknameAuth.windowMs,
    );
    if (!(await verifyPassword(claim.passwordHash, nicknamePassword)))
      throw new AppError(
        "NICKNAME_PROTECTED",
        "That nickname is protected. The password was incorrect.",
        401,
      );
  }
  const role =
    hostToken && (await verifyPassword(room.hostSecretHash, hostToken))
      ? "host"
      : "participant";
  const sessionToken = randomToken();
  const session = await app.prisma.roomSession.create({
    data: {
      roomId: room.id,
      nicknameClaimId: claim?.id ?? null,
      ...normalized,
      accessTier: "member",
      role,
      sessionTokenHash: hashToken(sessionToken),
    },
  });
  return {
    session,
    sessionToken,
    websocketToken: signWsToken({ roomId: room.id, sessionId: session.id }),
  };
}
