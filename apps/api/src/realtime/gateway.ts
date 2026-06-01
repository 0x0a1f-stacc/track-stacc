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
    const [queueItems, messages] = await Promise.all([
      app.prisma.queueItem.findMany({
        where: { roomId, status: { in: ["queued", "playing", "suggested"] } },
        orderBy: [{ score: "desc" }, { position: "asc" }],
        include: { track: true },
      }),
      app.prisma.chatMessage.findMany({
        where: { roomId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
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
        queue: queueItems.map((item) => ({
          id: item.id,
          roomId,
          track: {
            provider: "youtube" as const,
            videoId: item.track.providerVideoId,
            title: item.track.title,
            channelTitle: item.track.channelTitle,
            thumbnailUrl: item.track.thumbnailUrl,
            durationSeconds: item.track.durationSeconds,
          },
          addedBySessionId: item.addedBySessionId,
          status: item.status,
          position: item.position,
          score: item.score,
          mechanicContext: item.mechanicContext as Record<string, unknown>,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        participants: await getParticipants(app, roomId),
        recentMessages: messages.reverse().map((msg) => ({
          id: msg.id,
          roomId,
          senderSessionId: msg.senderSessionId,
          senderNickname: null,
          type: msg.messageType,
          body: msg.body,
          metadata: msg.metadata as Record<string, unknown>,
          deletedAt: null,
          createdAt: msg.createdAt.toISOString(),
        })),
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
