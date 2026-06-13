import { createAdapter } from "@socket.io/redis-adapter";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import { AppError } from "../lib/errors.js";
import { verifyWsToken } from "../lib/tokens.js";
import { PlaybackStatus } from "@trackstacc/types";
import {
  destroyAllTimers,
  emitResync,
  getPlaybackState,
} from "../modules/playback/playback.coordinator.js";
import { roomChannel } from "./broadcast.js";
import { getParticipants, markSessionPresent, cleanupInactiveSessions } from "./presence.manager.js";
import { registerRoomHandlers } from "./room.gateway.js";
import { broadcast } from "./broadcast.js";

interface SocketData {
  roomId: string;
  sessionId: string;
  accessTier: string;
}

export async function registerRealtime(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: app.config.corsOrigins,
      credentials: true,
    },
  });
  const pub = app.redis.duplicate();
  const sub = app.redis.duplicate();
  if (typeof pub.on === "function") {
    pub.on("error", (err) => {
      app.log.warn({ err }, "Redis pub client error");
    });
  }
  if (typeof sub.on === "function") {
    sub.on("error", (err) => {
      app.log.warn({ err }, "Redis sub client error");
    });
  }
  try {
    io.adapter(createAdapter(pub, sub));
  } catch {
    // Redis adapter setup may fail in test environments.
    // Socket.IO fallback adapter will be used.
  }
  io.use((socket, next) => {
    void (async () => {
      try {
        const token = String(
          socket.handshake.auth.token ?? socket.handshake.query.token ?? "",
        );
        const payload = verifyWsToken(token);
        const session = await app.prisma.roomSession.findUnique({
          where: { id: payload.sessionId },
        });
        if (!session || session.roomId !== payload.roomId || session.isBanned)
          throw new AppError("WEBSOCKET_TOKEN_INVALID", "invalid session", 401);
        const data = socket.data as SocketData;
        data.roomId = payload.roomId;
        data.sessionId = payload.sessionId;
        data.accessTier = payload.accessTier ?? session.accessTier;
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error("unauthorized"));
      }
    })();
  });
  io.on("connection", async (socket) => {
    const data = socket.data as SocketData;
    const roomId = data.roomId;
    const sessionId = data.sessionId;

    // Register event handlers before any async work so the client's early
    // messages (e.g. chat.send on connect) are caught by the tier guard
    // instead of being silently dropped.
    registerRoomHandlers(app, io, socket, roomId, sessionId);

    await socket.join(roomChannel(roomId));
    await app.prisma.roomSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(), leftAt: null },
    });
    await markSessionPresent(app, roomId, sessionId);
    await cleanupInactiveSessions(app, roomId);

    // Broadcast presence update to other room participants
    broadcast(io, roomId, {
      type: "presence.updated",
      participants: await getParticipants(app, roomId),
    });

    const room = await app.prisma.room.findUniqueOrThrow({
      where: { id: roomId },
    });
    const [queueItems, currentPlayback] = await Promise.all([
      app.prisma.queueItem.findMany({
        where: { roomId, status: { in: ["queued", "playing", "suggested"] } },
        orderBy: [{ score: "desc" }, { position: "asc" }],
        include: { track: true },
      }),
      getPlaybackState(app, roomId),
    ]);
    const chatMessages =
      data.accessTier !== "listener" || room.listenerChatVisible
        ? await app.prisma.chatMessage.findMany({
            where: { roomId, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [];
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
        currentPlayback,
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
        recentMessages: chatMessages.reverse().map((msg) => ({
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
    if (currentPlayback.status === PlaybackStatus.Playing) {
      emitResync(io, roomId, currentPlayback);
    }
    socket.on("disconnect", async () => {
      await app.prisma.roomSession
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
      await cleanupInactiveSessions(app, roomId);
      broadcast(io, roomId, {
        type: "presence.updated",
        participants: await getParticipants(app, roomId),
      });
    });
  });
  try {
    app.addHook("onClose", async () => {
      destroyAllTimers();
      await pub.quit();
      await sub.quit();
      void io.close();
    });
  } catch {
    // Swallow: in test environments the app may already be ready,
    // making addHook("onClose", ...) unavailable. Cleanup is handled
    // by the test teardown.
  }
  return io;
}
