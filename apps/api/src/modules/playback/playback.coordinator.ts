import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { PlaybackStatus, type PlaybackState } from "@trackstacc/types";

import { AppError } from "../../lib/errors.js";
import { broadcast } from "../../realtime/broadcast.js";
import { selectNextTrack } from "../queue/queue.engine.js";

const key = (roomId: string) => `playback:${roomId}`;

export async function getPlaybackState(
  app: FastifyInstance,
  roomId: string,
): Promise<PlaybackState> {
  const raw = await app.redis.get(key(roomId));
  if (raw) return JSON.parse(raw) as PlaybackState;
  return {
    roomId,
    queueItemId: null,
    videoId: null,
    title: null,
    status: PlaybackStatus.Stopped,
    startedAt: null,
    serverPositionSeconds: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function startTrack(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  queueItemId: string,
) {
  const item = await app.prisma.queueItem.update({
    where: { id: queueItemId },
    data: { status: "playing", startedAt: new Date() },
    include: { track: true },
  });
  const state: PlaybackState = {
    roomId,
    queueItemId,
    videoId: item.track.providerVideoId,
    title: item.track.title,
    status: PlaybackStatus.Playing,
    startedAt: new Date().toISOString(),
    serverPositionSeconds: 0,
    updatedAt: new Date().toISOString(),
  };
  await app.redis.set(key(roomId), JSON.stringify(state));
  broadcast(io, roomId, { type: "playback.state", state });
  return state;
}

export async function advanceQueue(
  app: FastifyInstance,
  io: Server,
  roomId: string,
) {
  const room = await app.prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
  const current = await getPlaybackState(app, roomId);
  if (current.queueItemId)
    await app.prisma.queueItem
      .update({
        where: { id: current.queueItemId },
        data: { status: "played", endedAt: new Date() },
      })
      .catch(() => undefined);
  const next = await selectNextTrack(app.prisma, roomId, room.playlistMechanic);
  if (!next) {
    const state: PlaybackState = {
      roomId,
      queueItemId: null,
      videoId: null,
      title: null,
      status: PlaybackStatus.Stopped,
      startedAt: null,
      serverPositionSeconds: 0,
      updatedAt: new Date().toISOString(),
    };
    await app.redis.set(key(roomId), JSON.stringify(state));
    broadcast(io, roomId, { type: "playback.state", state });
    return state;
  }
  return startTrack(app, io, roomId, next.id);
}

export async function skipTrack(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  actorSessionId: string,
) {
  const actor = await app.prisma.roomSession.findUnique({
    where: { id: actorSessionId },
  });
  if (!actor || !["host", "moderator"].includes(actor.role))
    throw new AppError("FORBIDDEN", "Only hosts and moderators can skip.", 403);
  return advanceQueue(app, io, roomId);
}

export async function handleClientEnd(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  queueItemId: string,
) {
  const state = await getPlaybackState(app, roomId);
  if (state.queueItemId !== queueItemId) return state;
  return advanceQueue(app, io, roomId);
}
