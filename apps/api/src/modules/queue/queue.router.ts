import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import {
  addQueueItemSchema,
  rejectSchema,
  voteSchema,
} from "./queue.schema.js";
import { addQueueItem, voteQueueItem } from "./queue.service.js";

export async function queueRouter(app: FastifyInstance) {
  app.post("/api/rooms/:roomId/queue/items", async (request) => {
    if (!request.session)
      throw new AppError(
        "UNAUTHENTICATED",
        "Join the room before doing that.",
        401,
      );
    const { roomId } = request.params as { roomId: string };
    const body = addQueueItemSchema.parse(request.body);
    const queueItem = await addQueueItem(
      app,
      roomId,
      request.session.id,
      body.youtubeUrl,
    );
    return { queueItem };
  });
  app.delete("/api/rooms/:roomId/queue/items/:queueItemId", async (request) => {
    if (!request.session)
      throw new AppError(
        "UNAUTHENTICATED",
        "Join the room before doing that.",
        401,
      );
    const { queueItemId } = request.params as { queueItemId: string };
    const item = await app.prisma.queueItem.findUniqueOrThrow({
      where: { id: queueItemId },
    });
    if (
      item.addedBySessionId !== request.session.id &&
      !["host", "moderator"].includes(request.session.role)
    )
      throw new AppError(
        "FORBIDDEN",
        "You cannot remove that queue item.",
        403,
      );
    return {
      queueItem: await app.prisma.queueItem.update({
        where: { id: queueItemId },
        data: { status: "removed" },
      }),
    };
  });
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/vote",
    async (request) => {
      if (!request.session)
        throw new AppError(
          "UNAUTHENTICATED",
          "Join the room before doing that.",
          401,
        );
      const { queueItemId } = request.params as { queueItemId: string };
      const body = voteSchema.parse(request.body);
      return {
        queueItem: await voteQueueItem(
          app,
          queueItemId,
          request.session.id,
          body.vote,
        ),
      };
    },
  );
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/approve",
    async (request) => {
      if (
        !request.session ||
        !["host", "moderator"].includes(request.session.role)
      )
        throw new AppError(
          "FORBIDDEN",
          "Only hosts and moderators can approve.",
          403,
        );
      const { queueItemId } = request.params as { queueItemId: string };
      return {
        queueItem: await app.prisma.queueItem.update({
          where: { id: queueItemId },
          data: { status: "queued" },
        }),
      };
    },
  );
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/reject",
    async (request) => {
      rejectSchema.parse(request.body);
      if (
        !request.session ||
        !["host", "moderator"].includes(request.session.role)
      )
        throw new AppError(
          "FORBIDDEN",
          "Only hosts and moderators can reject.",
          403,
        );
      const { queueItemId } = request.params as { queueItemId: string };
      return {
        queueItem: await app.prisma.queueItem.update({
          where: { id: queueItemId },
          data: { status: "rejected" },
        }),
      };
    },
  );
}
