import type { FastifyInstance } from "fastify";

import { requireModerator, type SessionGuard } from "../../auth/guards.js";
import { AppError } from "../../lib/errors.js";

type ModerationAction = "mute" | "unmute" | "ban" | "unban";

export function assertModerator(
  session: SessionGuard | undefined,
) {
  requireModerator(session);
}

function assertModerationHierarchy(
  actor: { id: string; role: string },
  target: { id: string; role: string },
  actionType: ModerationAction,
) {
  if (actionType !== "mute" && actionType !== "ban") {
    return;
  }

  if (actor.id === target.id) {
    throw new AppError(
      "FORBIDDEN",
      "You cannot moderate your own session.",
      403,
    );
  }

  if (actor.role !== "moderator") {
    return;
  }

  if (target.role === "host") {
    throw new AppError(
      "FORBIDDEN",
      "Moderators cannot moderate the host.",
      403,
    );
  }

  if (target.role === "moderator") {
    throw new AppError(
      "FORBIDDEN",
      "Moderators cannot moderate other moderators.",
      403,
    );
  }
}

export async function applyModeration(
  app: FastifyInstance,
  roomId: string,
  actorSessionId: string,
  targetSessionId: string,
  actionType: ModerationAction,
  reason?: string,
) {
  const actor = await app.prisma.roomSession.findUnique({
    where: { id: actorSessionId },
  });
  if (!actor || actor.roomId !== roomId) {
    throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
  }

  const target = await app.prisma.roomSession.findFirst({
    where: { id: targetSessionId, roomId },
  });
  if (!target) {
    throw new AppError("FORBIDDEN", "Target session not found in this room.", 403);
  }

  assertModerationHierarchy(actor, target, actionType);

  const data =
    actionType === "mute"
      ? { isMuted: true }
      : actionType === "unmute"
        ? { isMuted: false }
        : actionType === "ban"
          ? { isBanned: true, leftAt: target.leftAt ?? new Date() }
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
