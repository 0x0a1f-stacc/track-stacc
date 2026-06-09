import type { FastifyInstance } from "fastify";

import { verifyPassword } from "../../lib/argon2.js";
import { AppError } from "../../lib/errors.js";
import { hashToken, randomToken, signWsToken } from "../../lib/tokens.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listenToRoom(
  app: FastifyInstance,
  roomIdOrSlug: string,
  roomPassword: string | undefined,
) {
  const room = await app.prisma.room.findFirst({
    where: uuidPattern.test(roomIdOrSlug)
      ? { OR: [{ id: roomIdOrSlug }, { slug: roomIdOrSlug }] }
      : { slug: roomIdOrSlug },
  });
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);

  if (room.roomPasswordHash) {
    if (!roomPassword)
      throw new AppError(
        "ROOM_PASSWORD_REQUIRED",
        "This room requires a password.",
        401,
      );
    const valid = await verifyPassword(room.roomPasswordHash, roomPassword).catch(
      () => false,
    );
    if (!valid)
      throw new AppError(
        "ROOM_PASSWORD_INCORRECT",
        "Room password was incorrect.",
        403,
      );
  }

  const sessionToken = randomToken();
  const session = await app.prisma.roomSession.create({
    data: {
      roomId: room.id,
      accessTier: "listener",
      role: "listener",
      normalizedNickname: null,
      displayNickname: null,
      nicknameClaimId: null,
      sessionTokenHash: hashToken(sessionToken),
    },
  });

  const websocketToken = signWsToken({
    roomId: room.id,
    sessionId: session.id,
    accessTier: "listener",
  });

  return { session, sessionToken, websocketToken };
}
