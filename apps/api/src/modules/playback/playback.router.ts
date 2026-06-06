import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";

import { AppError } from "../../lib/errors.js";
import {
  autoSkipTrack,
  getPlaybackState,
  skipTrack,
} from "./playback.coordinator.js";

async function evaluateSkipVote(
  app: FastifyInstance,
  io: Server,
  roomId: string,
  queueItemId: string,
): Promise<{ skipped: boolean; votesNeeded: number; currentVotes: number }> {
  const room = await app.prisma.room.findUnique({ where: { id: roomId } });
  if (!room)
    throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);

  const [voteCount, activeCount] = await Promise.all([
    app.prisma.skipVote.count({
      where: { queueItemId },
    }),
    app.prisma.roomSession.count({
      where: {
        roomId,
        leftAt: null,
        isMuted: false,
        isBanned: false,
        lastSeenAt: { gt: new Date(Date.now() - 90_000) },
      },
    }),
  ]);

  const threshold = room.skipVoteThresholdValue;
  const isPercentage = room.skipVoteThresholdType === "percentage";
  const votesNeeded = isPercentage
    ? Math.ceil((threshold / 100) * activeCount)
    : threshold;

  if (voteCount >= votesNeeded && votesNeeded > 0) {
    await autoSkipTrack(app, io, roomId);
    return { skipped: true, votesNeeded, currentVotes: voteCount };
  }
  return { skipped: false, votesNeeded, currentVotes: voteCount };
}

export async function playbackRouter(app: FastifyInstance, io: Server) {
  app.post("/api/rooms/:roomId/playback/skip", async (request) => {
    if (!request.session)
      throw new AppError(
        "UNAUTHENTICATED",
        "Join the room before doing that.",
        401,
      );
    const { roomId } = request.params as { roomId: string };
    return { state: await skipTrack(app, io, roomId, request.session.id) };
  });
  app.post("/api/rooms/:roomId/playback/skip-vote", async (request) => {
    if (!request.session)
      throw new AppError(
        "UNAUTHENTICATED",
        "Join the room before doing that.",
        401,
      );
    const { roomId } = request.params as { roomId: string };
    const state = await getPlaybackState(app, roomId);
    if (!state.queueItemId)
      throw new AppError("NO_TRACK_PLAYING", "No track is playing.");
    await app.prisma.skipVote.upsert({
      where: {
        queueItemId_roomSessionId: {
          queueItemId: state.queueItemId,
          roomSessionId: request.session.id,
        },
      },
      create: {
        queueItemId: state.queueItemId,
        roomSessionId: request.session.id,
      },
      update: {},
    });
    return evaluateSkipVote(app, io, roomId, state.queueItemId);
  });
}
