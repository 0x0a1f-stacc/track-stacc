import type { FastifyInstance } from "fastify";

import { requireModerator, type SessionGuard } from "../../auth/guards.js";
import { AppError } from "../../lib/errors.js";

export function assertModerator(
  session: SessionGuard | undefined,
) {
  requireModerator(session);
}

export async function applyModeration(
  app: FastifyInstance,
  roomId: string,
  actorSessionId: string,
  targetSessionId: string,
  actionType: "mute" | "unmute" | "ban" | "unban",
  reason?: string,
) {
  const target = await app.prisma.roomSession.findFirst({
    where: { id: targetSessionId, roomId },
  });
  if (!target) {
    throw new AppError("FORBIDDEN", "Target session not found in this room.", 403);
  }

  const data =
    actionType === "mute"
      ? { isMuted: true }
      : actionType === "unmute"
        ? { isMuted: false }
        : actionType === "ban"
          ? { isBanned: true }
          : { isBanned: false };
  const updatedTarget = await app.prisma.roomSession.update({
    where: { id: target.id },
    data,
  });
  await app.prisma.roomModerationAction.create({
    data: {
      roomId,
      actorSessionId,
      targetSessionId,
      actionType,
      reason: reason ?? null,
      metadata: {},
    },
  });
  return updatedTarget;
}
