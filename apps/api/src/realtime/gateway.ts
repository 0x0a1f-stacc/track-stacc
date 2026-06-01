import { createAdapter } from "@socket.io/redis-adapter";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import { verifyWsToken } from "../lib/tokens.js";
import {
  destroyAllTimers,
  getPlaybackState,
} from "../modules/playback/playback.coordinator.js";
import { roomChannel } from "./broadcast.js";
import { getParticipants } from "./presence.manager.js";
import { registerRoomHandlers } from "./room.gateway.js";

export async function registerRealtime(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
      credentials: true,
    },
  });
  const pub = app.redis.duplicate();
  const sub = app.redis.duplicate();
  io.adapter(createAdapter(pub, sub));
  io.use(async (socket, next) => {
    try {
      const token = String(
        socket.handshake.auth.token ?? socket.handshake.query.token ?? "",
      );
      const payload = verifyWsToken(token);
      const session = await app.prisma.roomSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session || session.roomId !== payload.roomId || session.isBanned)
        throw new Error("invalid session");
      socket.data.roomId = payload.roomId;
      socket.data.sessionId = payload.sessionId;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("unauthorized"));
    }
  });
  io.on("connection", async (socket) => {
    const roomId = String(socket.data.roomId);
    const sessionId = String(socket.data.sessionId);
    await socket.join(roomChannel(roomId));
    await app.prisma.roomSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(), leftAt: null },
    });
    const room = await app.prisma.room.findUniqueOrThrow({
      where: { id: roomId },
    });
    socket.emit("room.snapshot", {
      type: "room.snapshot",
      payload: {
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
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
          lastActiveAt: room.lastActiveAt.toISOString(),
        },
        currentPlayback: await getPlaybackState(app, roomId),
        queue: [],
        participants: await getParticipants(app, roomId),
        recentMessages: [],
      },
    });
    registerRoomHandlers(app, io, socket, roomId, sessionId);
    socket.on("disconnect", async () => {
      await app.prisma.roomSession
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
      io.to(roomChannel(roomId)).emit("presence.updated", {
        type: "presence.updated",
        participants: await getParticipants(app, roomId),
      });
    });
  });
  app.addHook("onClose", async () => {
    destroyAllTimers();
    await pub.quit();
    await sub.quit();
    io.close();
  });
  return io;
}
