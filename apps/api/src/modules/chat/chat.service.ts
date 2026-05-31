import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";

export async function sendChatMessage(
  app: FastifyInstance,
  roomId: string,
  sessionId: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  await assertRateLimit(
    app.redis,
    `rl:chat:${sessionId}`,
    rateLimits.chat.max,
    rateLimits.chat.windowMs,
  );
  const [room, session] = await Promise.all([
    app.prisma.room.findUnique({ where: { id: roomId } }),
    app.prisma.roomSession.findUnique({ where: { id: sessionId } }),
  ]);
  if (!room || !session || session.roomId !== roomId)
    throw new AppError("FORBIDDEN", "Join the room before chatting.", 403);
  if (session.isMuted)
    throw new AppError("MUTED", "You are muted in this room.", 403);
  if (room.chatLocked && !["host", "moderator"].includes(session.role))
    throw new AppError("CHAT_LOCKED", "The host has locked chat.", 403);
  return app.prisma.chatMessage.create({
    data: {
      roomId,
      senderSessionId: sessionId,
      messageType: "user",
      body,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
