import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";

import { requireMember, requireModerator } from "../../auth/guards.js";
import { AppError } from "../../lib/errors.js";
import { maybeAutoStart } from "../playback/playback.coordinator.js";

import {
  addQueueItemSchema,
  rejectSchema,
  voteSchema,
} from "./queue.schema.js";
import { addQueueItem, voteQueueItem } from "./queue.service.js";

export async function queueRouter(app: FastifyInstance, io: Server) {
  app.post("/api/rooms/:roomId/queue/items", async (request) => {
    const session = requireMember(request.session);
    const { roomId } = request.params as { roomId: string };
    const body = addQueueItemSchema.parse(request.body);
    const queueItem = await addQueueItem(
      app,
      roomId,
      session.id,
      body.youtubeUrl,
    );
    if (queueItem.status === "queued") await maybeAutoStart(app, io, roomId);
    return { queueItem };
  });
  app.get("/api/rooms/:roomId/queue", async (request) => {
    if (!request.session)
      throw new AppError(
        "AUTH_REQUIRED",
        "Join the room before doing that.",
        401,
      );
    const { roomId } = request.params as { roomId: string };
    const items = await app.prisma.queueItem.findMany({
      where: { roomId, status: { in: ["queued", "playing", "suggested"] } },
      orderBy: [{ score: "desc" }, { position: "asc" }],
      include: { track: true },
    });
    return { queue: items };
  });
  app.delete("/api/rooms/:roomId/queue/items/:queueItemId", async (request) => {
    const session = requireMember(request.session);
    const { roomId, queueItemId } = request.params as {
      roomId: string;
      queueItemId: string;
    };

    if (session.roomId !== roomId) {
      throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
    }

    const item = await app.prisma.queueItem.findFirst({
      where: { id: queueItemId, roomId },
    });

    if (!item) {
      throw new AppError(
        "QUEUE_ITEM_NOT_FOUND",
        "That queue item was not found.",
        404,
      );
    }

    if (
      item.addedBySessionId !== session.id &&
      !["host", "moderator"].includes(session.role)
    )
      throw new AppError(
        "FORBIDDEN",
        "You cannot remove that queue item.",
        403,
      );

    return {
      queueItem: await app.prisma.queueItem.update({
        where: { id: item.id },
        data: { status: "removed" },
      }),
    };
  });
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/vote",
    async (request) => {
      const session = requireMember(request.session);
      const { roomId, queueItemId } = request.params as {
        roomId: string;
        queueItemId: string;
      };

      if (session.roomId !== roomId) {
        throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
      }

      const body = voteSchema.parse(request.body);
      return {
        queueItem: await voteQueueItem(
          app,
          roomId,
          queueItemId,
          session.id,
          body.vote,
        ),
      };
    },
  );
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/approve",
    async (request) => {
      const session = requireModerator(request.session);
      const { roomId, queueItemId } = request.params as {
        roomId: string;
        queueItemId: string;
      };

      if (session.roomId !== roomId) {
        throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
      }

      const item = await app.prisma.queueItem.findFirst({
        where: { id: queueItemId, roomId },
      });

      if (!item) {
        throw new AppError(
          "QUEUE_ITEM_NOT_FOUND",
          "That queue item was not found.",
          404,
        );
      }

      return {
        queueItem: await app.prisma.queueItem.update({
          where: { id: item.id },
          data: { status: "queued" },
        }),
      };
    },
  );
  app.post(
    "/api/rooms/:roomId/queue/items/:queueItemId/reject",
    async (request) => {
      rejectSchema.parse(request.body);
      const session = requireModerator(request.session);
      const { roomId, queueItemId } = request.params as {
        roomId: string;
        queueItemId: string;
      };

      if (session.roomId !== roomId) {
        throw new AppError("FORBIDDEN", "You are not allowed to do that.", 403);
      }

      const item = await app.prisma.queueItem.findFirst({
        where: { id: queueItemId, roomId },
      });

      if (!item) {
        throw new AppError(
          "QUEUE_ITEM_NOT_FOUND",
          "That queue item was not found.",
          404,
        );
      }

      return {
        queueItem: await app.prisma.queueItem.update({
          where: { id: item.id },
          data: { status: "rejected" },
        }),
      };
    },
  );
}
