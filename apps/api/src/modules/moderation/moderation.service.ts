import type { FastifyInstance } from "fastify";

import { requireModerator } from "../../auth/guards.js";

export function assertModerator(
  session: { accessTier: string; role: string } | undefined,
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
  const data =
    actionType === "mute"
      ? { isMuted: true }
      : actionType === "unmute"
        ? { isMuted: false }
        : actionType === "ban"
          ? { isBanned: true }
          : { isBanned: false };
  const target = await app.prisma.roomSession.update({
    where: { id: targetSessionId },
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
  return target;
}
