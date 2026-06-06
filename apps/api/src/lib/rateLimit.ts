import type { Redis } from "ioredis";

import { AppError } from "./errors.js";

export async function assertRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowMs: number,
) {
  const current = await redis.incr(key);
  if (current === 1) await redis.pexpire(key, windowMs);
  if (current > max)
    throw new AppError(
      "RATE_LIMITED",
      "You are doing that too quickly. Try again shortly.",
      429,
    );
}

export const rateLimits = {
  chat: {
    max: Number(process.env.RATE_LIMIT_CHAT_MAX ?? 5),
    windowMs: Number(process.env.RATE_LIMIT_CHAT_WINDOW_MS ?? 10_000),
  },
  addSong: {
    max: Number(process.env.RATE_LIMIT_ADD_SONG_MAX ?? 5),
    windowMs: Number(process.env.RATE_LIMIT_ADD_SONG_WINDOW_MS ?? 30_000),
  },
  nicknameChange: { max: 3, windowMs: 10 * 60_000 },
  nicknameAuth: {
    max: Number(process.env.RATE_LIMIT_NICKNAME_AUTH_MAX ?? 5),
    windowMs: Number(
      process.env.RATE_LIMIT_NICKNAME_AUTH_WINDOW_MS ?? 15 * 60_000,
    ),
  },
  roomCreate: {
    max: Number(process.env.RATE_LIMIT_ROOM_CREATE_MAX ?? 5),
    windowMs: Number(
      process.env.RATE_LIMIT_ROOM_CREATE_WINDOW_MS ?? 60 * 60_000,
    ),
  },
  mechanicChange: { max: 1, windowMs: 5 * 60_000 },
};
