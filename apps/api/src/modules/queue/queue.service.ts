import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";
import { getOrFetchTrack } from "../youtube/youtube.service.js";

export async function addQueueItem(
  app: FastifyInstance,
  roomId: string,
  sessionId: string,
  youtubeUrl: string,
) {
  await assertRateLimit(
    app.redis,
    `rl:add-song:${sessionId}`,
    rateLimits.addSong.max,
    rateLimits.addSong.windowMs,
  );
  const [room, session] = await Promise.all([
    app.prisma.room.findUnique({ where: { id: roomId } }),
    app.prisma.roomSession.findUnique({ where: { id: sessionId } }),
  ]);
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
  if (
    !session ||
    session.roomId !== roomId ||
    session.isMuted ||
    session.isBanned
  )
    throw new AppError("FORBIDDEN", "You cannot add songs in this room.", 403);
  if (room.queueLocked && !["host", "moderator"].includes(session.role))
    throw new AppError(
      "QUEUE_LOCKED",
      "The host has locked song additions.",
      403,
    );
  const track = await getOrFetchTrack(app.prisma, app.redis, youtubeUrl);
  if (!track)
    throw new AppError(
      "VIDEO_UNAVAILABLE",
      "This video cannot be played here. Try another YouTube link.",
    );
  if (
    track.durationSeconds &&
    track.durationSeconds > room.maxSongDurationSeconds
  )
    throw new AppError(
      "VIDEO_TOO_LONG",
      "This video is longer than the room limit.",
      400,
      { maxDurationSeconds: room.maxSongDurationSeconds },
    );
  if (track.isEmbeddable === false)
    throw new AppError(
      "VIDEO_UNAVAILABLE",
      "This video cannot be played here. Try another YouTube link.",
    );
  if (room.duplicatePolicy !== "allow") {
    if (room.duplicatePolicy === "block_queue") {
      const duplicate = await app.prisma.queueItem.findFirst({
        where: {
          roomId,
          trackId: track.id,
          status: { in: ["queued", "playing"] },
        },
      });
      if (duplicate)
        throw new AppError(
          "DUPLICATE_VIDEO",
          "That song is already in the queue.",
        );
    } else if (room.duplicatePolicy === "block_recent") {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const duplicate = await app.prisma.queueItem.findFirst({
        where: {
          roomId,
          trackId: track.id,
          status: { in: ["played", "skipped"] },
          endedAt: { gt: threeHoursAgo },
        },
      });
      if (duplicate)
        throw new AppError(
          "DUPLICATE_VIDEO",
          "That song was played recently.",
        );
    } else if (room.duplicatePolicy === "block_session") {
      const duplicate = await app.prisma.queueItem.findFirst({
        where: {
          roomId,
          trackId: track.id,
          addedBySessionId: sessionId,
        },
      });
      if (duplicate)
        throw new AppError(
          "DUPLICATE_VIDEO",
          "You have already added that song.",
        );
    }
  }
  const last = await app.prisma.queueItem.aggregate({
    where: { roomId },
    _max: { position: true },
  });
  const status =
    room.playlistMechanic === "suggestions" && session.role === "participant"
      ? "suggested"
      : "queued";
  return app.prisma.queueItem.create({
    data: {
      roomId,
      trackId: track.id,
      addedBySessionId: sessionId,
      status,
      position: (last._max.position ?? 0) + 1,
    },
    include: { track: true },
  });
}

export async function voteQueueItem(
  app: FastifyInstance,
  roomId: string,
  queueItemId: string,
  sessionId: string,
  vote: 1 | -1,
) {
  const item = await app.prisma.queueItem.findFirst({
    where: { id: queueItemId, roomId },
  });
  if (!item)
    throw new AppError("QUEUE_ITEM_NOT_FOUND", "Queue item not found.", 404);
  await app.prisma.queueVote.upsert({
    where: {
      queueItemId_roomSessionId: { queueItemId, roomSessionId: sessionId },
    },
    update: { vote },
    create: { queueItemId, roomSessionId: sessionId, vote },
  });
  const aggregate = await app.prisma.queueVote.aggregate({
    where: { queueItemId },
    _sum: { vote: true },
  });
  return app.prisma.queueItem.update({
    where: { id: queueItemId },
    data: { score: aggregate._sum.vote ?? 0 },
  });
}
