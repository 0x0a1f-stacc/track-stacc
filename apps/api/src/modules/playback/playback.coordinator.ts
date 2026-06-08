import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { PlaybackStatus, type PlaybackState } from "@trackstacc/types";

import { AppError } from "../../lib/errors.js";
import { broadcast } from "../../realtime/broadcast.js";
import { selectNextTrack } from "../queue/queue.engine.js";

const key = (roomId: string) => `playback:${roomId}`;

const roomTimers = new Map<
  string,
  {
    fallbackTimeout: NodeJS.Timeout | null;
    resyncInterval: NodeJS.Timeout;
    bufferingTimeout: NodeJS.Timeout | null;
  }
>();

function clearRoomTimers(roomId: string) {
  const timers = roomTimers.get(roomId);
  if (!timers) return;
  if (timers.fallbackTimeout) clearTimeout(timers.fallbackTimeout);
  clearInterval(timers.resyncInterval);
  if (timers.bufferingTimeout) clearTimeout(timers.bufferingTimeout);
  roomTimers.delete(roomId);
}

export function destroyAllTimers() {
  for (const roomId of roomTimers.keys()) clearRoomTimers(roomId);
}

export async function getPlaybackState(
  app: FastifyInstance,
  roomId: string,
): Promise<PlaybackState> {
  const raw = await app.redis.get(key(roomId));
  if (raw) {
    const state = JSON.parse(raw) as PlaybackState;
    if (state.status === PlaybackStatus.Playing && state.startedAt) {
      state.serverPositionSeconds =
        (Date.now() - new Date(state.startedAt).getTime()) / 1000;
    }
    return state;
  }
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

export function emitResync(io: Server, roomId: string, state: PlaybackState) {
  if (state.status !== PlaybackStatus.Playing || !state.startedAt) return;
  const serverPositionSeconds =
    (Date.now() - new Date(state.startedAt).getTime()) / 1000;
  broadcast(io, roomId, {
    type: "playback.resync",
    state: { ...state, serverPositionSeconds },
  });
}

async function fallbackAdvance(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  expectedQueueItemId: string,
) {
  const state = await getPlaybackState(app, roomId);
  if (state.queueItemId !== expectedQueueItemId) return;
  if (state.status !== PlaybackStatus.Playing) return;
  await app.prisma.queueItem
    .update({
      where: { id: expectedQueueItemId },
      data: { status: "failed", endedAt: new Date() },
    })
    .catch(() => undefined);
  return advanceQueue(app, io, roomId);
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
  const startedAt = new Date();
  const state: PlaybackState = {
    roomId,
    queueItemId,
    videoId: item.track.providerVideoId,
    title: item.track.title,
    status: PlaybackStatus.Playing,
    startedAt: startedAt.toISOString(),
    serverPositionSeconds: 0,
    updatedAt: startedAt.toISOString(),
  };
  await app.redis.set(key(roomId), JSON.stringify(state));
  broadcast(io, roomId, { type: "playback.state", state });

  clearRoomTimers(roomId);

  const hasDuration = item.track.durationSeconds != null;

  const resyncFn = () => emitResync(io, roomId, state);
  const resyncInterval = setInterval(resyncFn, 30_000);

  if (hasDuration) {
    const fallbackSeconds = item.track.durationSeconds! + 30;
    const fallbackTimeout = setTimeout(() => {
      fallbackAdvance(app, io, roomId, queueItemId).catch(() => undefined);
    }, fallbackSeconds * 1000);
    roomTimers.set(roomId, {
      fallbackTimeout,
      resyncInterval,
      bufferingTimeout: null,
    });
  } else {
    roomTimers.set(roomId, {
      fallbackTimeout: null!,
      resyncInterval,
      bufferingTimeout: null,
    });
  }

  return state;
}

function stopRoom(io: Server, roomId: string): PlaybackState {
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
  broadcast(io, roomId, { type: "playback.state", state });
  return state;
}

export async function advanceQueue(
  app: FastifyInstance,
  io: Server,
  roomId: string,
) {
  const lockKey = `lock:advance:${roomId}`;
  let acquired: unknown;
  try {
    acquired = await app.redis.set(lockKey, "1", "EX", 10, "NX");
  } catch {
    acquired = null;
  }
  if (!acquired) {
    const state = await getPlaybackState(app, roomId);
    return state;
  }
  try {
    const room = await app.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
    const current = await getPlaybackState(app, roomId);
    if (current.queueItemId) {
      await Promise.all([
        app.prisma.queueItem
          .update({
            where: { id: current.queueItemId },
            data: { status: "played", endedAt: new Date() },
          })
          .catch(() => undefined),
        app.prisma.skipVote
          .deleteMany({ where: { queueItemId: current.queueItemId } })
          .catch(() => undefined),
      ]);
    }
    clearRoomTimers(roomId);
    const next = await selectNextTrack(
      app.prisma,
      roomId,
      room.playlistMechanic,
    );
    if (!next) {
      const state = stopRoom(io, roomId);
      await app.redis.set(key(roomId), JSON.stringify(state));
      return state;
    }
    return startTrack(app, io, roomId, next.id);
  } finally {
    await app.redis.del(lockKey).catch(() => undefined);
  }
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
  return autoSkipTrack(app, io, roomId);
}

export async function autoSkipTrack(
  app: FastifyInstance,
  io: Server,
  roomId: string,
) {
  try {
    return advanceQueue(app, io, roomId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    app.log.error({ err: error, roomId }, "autoSkipTrack failed");
    throw new AppError("SKIP_FAILED", "Could not skip the current track.");
  }
}

export function clearClientBuffering(roomId: string) {
  const timers = roomTimers.get(roomId);
  if (!timers?.bufferingTimeout) return;
  clearTimeout(timers.bufferingTimeout);
  roomTimers.set(roomId, { ...timers, bufferingTimeout: null });
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

export async function handleClientBuffering(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  queueItemId: string,
) {
  const state = await getPlaybackState(app, roomId);
  if (state.queueItemId !== queueItemId) return;

  const timers = roomTimers.get(roomId);
  if (!timers) return;
  if (timers.bufferingTimeout) return;

  const bufferingTimeout = setTimeout(() => {
    void (async () => {
      const current = await getPlaybackState(app, roomId);
      if (current.queueItemId !== queueItemId) return;
      await app.prisma.queueItem
        .update({
          where: { id: queueItemId },
          data: { status: "failed", endedAt: new Date() },
        })
        .catch(() => undefined);
      await advanceQueue(app, io, roomId);
    })();
  }, 30_000);

  roomTimers.set(roomId, { ...timers, bufferingTimeout });
}

export async function maybeAutoStart(
  app: FastifyInstance,
  io: Server,
  roomId: string,
) {
  const state = await getPlaybackState(app, roomId);
  if (state.status !== PlaybackStatus.Stopped || state.queueItemId !== null)
    return state;

  const alreadyPlaying = await app.prisma.queueItem.findFirst({
    where: { roomId, status: "playing" },
    select: { id: true },
  });
  if (alreadyPlaying) return state;

  return advanceQueue(app, io, roomId);
}
