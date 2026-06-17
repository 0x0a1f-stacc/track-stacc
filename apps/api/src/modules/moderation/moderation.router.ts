import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";

import { applyModeration, assertModerator } from "./moderation.service.js";

const bodySchema = z.object({
  targetSessionId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export async function moderationRouter(app: FastifyInstance) {
  for (const actionType of ["mute", "unmute", "ban", "unban"] as const) {
    app.post(`/api/rooms/:roomId/moderation/${actionType}`, async (request) => {
      assertModerator(request.session);
      const { roomId } = request.params as { roomId: string };
      if (request.session?.roomId !== roomId) {
        throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
      }
      const body = bodySchema.parse(request.body);
      return {
        session: await applyModeration(
          app,
          roomId,
          request.session.id,
          body.targetSessionId,
          actionType,
          body.reason,
        ),
      };
    });
  }
}
