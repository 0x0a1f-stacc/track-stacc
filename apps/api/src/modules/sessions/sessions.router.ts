import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import { listenRoomSchema } from "./sessions.schema.js";
import { listenToRoom } from "./sessions.service.js";

export async function sessionsRouter(app: FastifyInstance) {
  app.post("/api/rooms/:roomId/listen", async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const body = listenRoomSchema.parse(request.body);
    const result = await listenToRoom(
      app,
      roomId,
      body.roomPassword,
      request.session,
    );
    // If a sessionToken was returned, a new session was created (201 Created).
    // If undefined, an existing valid session cookie was successfully rehydrated
    // without overwriting the client's current session token (200 OK).
    if (result.sessionToken !== undefined) {
      reply.setCookie("session_token", result.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: app.config.nodeEnv === "production",
      });
      reply.code(201);
    } else {
      reply.code(200);
    }
    return {
      session: {
        roomSessionId: result.session.id,
        accessTier: result.session.accessTier,
        role: result.session.role,
      },
      websocketToken: result.websocketToken,
    };
  });

  app.get("/api/rooms/:roomId", async (request) => {
    const { roomId } = request.params as { roomId: string };
    const room = await app.prisma.room.findFirst({
      where: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)
        ? { OR: [{ id: roomId }, { slug: roomId }] }
        : { slug: roomId },
    });
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
    return {
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        playlistMechanic: room.playlistMechanic,
        maxSongDurationSeconds: room.maxSongDurationSeconds,
        duplicatePolicy: room.duplicatePolicy,
        skipVoteThresholdType: room.skipVoteThresholdType,
        skipVoteThresholdValue: room.skipVoteThresholdValue,
        queueLocked: room.queueLocked,
        chatLocked: room.chatLocked,
        listenerChatVisible: room.listenerChatVisible,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
        lastActiveAt: room.lastActiveAt.toISOString(),
      },
    };
  });
}
