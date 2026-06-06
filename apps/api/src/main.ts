import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { ZodError } from "zod";

import authPlugin from "./plugins/auth.js";
import prismaPlugin from "./plugins/prisma.js";
import rateLimitPlugin from "./plugins/rateLimit.js";
import redisPlugin from "./plugins/redis.js";
import { AppError, toErrorResponse } from "./lib/errors.js";
import { chatRouter } from "./modules/chat/chat.router.js";
import { moderationRouter } from "./modules/moderation/moderation.router.js";
import { nicknamesRouter } from "./modules/nicknames/nicknames.router.js";
import { playbackRouter } from "./modules/playback/playback.router.js";
import { queueRouter } from "./modules/queue/queue.router.js";
import { roomsRouter } from "./modules/rooms/rooms.router.js";
import { registerRealtime } from "./realtime/gateway.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.statusCode).send(toErrorResponse(error));
    if (error instanceof ZodError)
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request.",
          details: error.flatten(),
        },
      });
    app.log.error(error);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/health/ready", async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    await app.redis.ping();
    return { ok: true };
  });

  await app.register(roomsRouter);
  await app.register(nicknamesRouter);
  await app.register(chatRouter);
  await app.register(moderationRouter);
  const io = await registerRealtime(app);
  app.decorate("io", io);
  await app.register(async (instance) => playbackRouter(instance, io));
  await app.register(async (instance) => queueRouter(instance, io));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildApp();
  await app.listen({
    host: process.env.API_HOST ?? "0.0.0.0",
    port: Number(process.env.API_PORT ?? 4000),
  });
}
