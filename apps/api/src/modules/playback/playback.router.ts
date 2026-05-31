import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";
import { skipTrack } from "./playback.coordinator.js";

export async function playbackRouter(
  app: FastifyInstance,
  io: import("socket.io").Server,
) {
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
    const state = await import("./playback.coordinator.js").then((mod) =>
      mod.getPlaybackState(app, roomId),
    );
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
    return { ok: true };
  });
}
