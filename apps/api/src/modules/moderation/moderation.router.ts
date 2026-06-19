import type { ModerationAppliedPayload } from "@trackstacc/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { broadcast, roomChannel } from "../../realtime/broadcast.js";
import { evictSessionPresence, getParticipants } from "../../realtime/presence.manager.js";

import { applyModeration, assertModerator } from "./moderation.service.js";

const bodySchema = z.object({
  targetSessionId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export async function moderationRouter(app: FastifyInstance) {
  for (const actionType of ["mute", "unmute", "ban", "unban"] as const) {
    app.post(`/api/rooms/:roomId/moderation/${actionType}`, async (request) => {
      const actorSession = request.session;
      if (!actorSession) {
        throw new AppError("AUTH_REQUIRED", "Join the room before doing that.", 401);
      }
      assertModerator(actorSession);
      const { roomId } = request.params as { roomId: string };
      if (actorSession.roomId !== roomId) {
        throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
      }
      const body = bodySchema.parse(request.body);

      const targetSession = await applyModeration(
        app,
        roomId,
        actorSession.id,
        body.targetSessionId,
        actionType,
        body.reason,
      );

      // For ban action: evict from Redis presence and disconnect sockets immediately
      if (actionType === "ban") {
        await evictSessionPresence(app, roomId, body.targetSessionId);

        const sockets = await app.io.in(roomChannel(roomId)).fetchSockets();
        for (const socket of sockets) {
          const socketData = socket.data as Record<string, unknown> | undefined;
          if (socketData?.sessionId === body.targetSessionId) {
            socket.disconnect(true);
          }
        }
      }

      // Broadcast moderation.applied to remaining room participants
      broadcast(app.io, roomId, {
        type: "moderation.applied",
        payload: {
          action: actionType,
          targetSessionId: body.targetSessionId,
          roomId,
          actorSessionId: actorSession.id,
          createdAt: new Date().toISOString(),
          ...(body.reason !== undefined && { reason: body.reason }),
        },
      });

      // Broadcast presence.updated to remaining room participants
      broadcast(app.io, roomId, {
        type: "presence.updated",
        participants: await getParticipants(app, roomId),
      });

      return {
        session: targetSession,
      };
    });
  }
}

