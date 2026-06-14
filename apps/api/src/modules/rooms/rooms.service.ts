import type {
  DuplicatePolicy,
  PlaylistMechanic,
  RoomVisibility,
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";

import { hashPassword } from "../../lib/argon2.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";
import { randomToken } from "../../lib/tokens.js";

function slugify(name: string) {
  return `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 40) || "room"
  }-${nanoid(5)}`;
}

export async function createRoom(
  app: FastifyInstance,
  ip: string,
  input: {
    name?: string | undefined;
    description?: string | undefined;
    playlistMechanic: PlaylistMechanic;
    visibility: RoomVisibility;
    maxSongDurationSeconds: number;
    duplicatePolicy: DuplicatePolicy;
    roomPassword?: string | undefined;
  },
) {
  await assertRateLimit(
    app.redis,
    `rl:create-room:${ip}`,
    rateLimits.roomCreate.max,
    rateLimits.roomCreate.windowMs,
  );
  const hostToken = randomToken();
  const name = input.name ?? "Untitled Room";
  const room = await app.prisma.room.create({
    data: {
      slug: slugify(name),
      name,
      description: input.description ?? null,
      playlistMechanic: input.playlistMechanic,
      visibility: input.visibility,
      maxSongDurationSeconds: input.maxSongDurationSeconds,
      duplicatePolicy: input.duplicatePolicy,
      roomPasswordHash: input.roomPassword
        ? await hashPassword(input.roomPassword)
        : null,
      hostSecretHash: await hashPassword(hostToken),
    },
  });
  return { room, hostToken };
}
