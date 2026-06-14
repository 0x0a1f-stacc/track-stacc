/* eslint-disable import-x/order */
import dotenv from "dotenv";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { nanoid } from "nanoid";
import { ZodError } from "zod";

import { loadConfig, createConfigPlugin } from "./lib/config.js";
import type { ApiConfig } from "./lib/config.js";
import { AppError, toErrorResponse } from "./lib/errors.js";
import { setSecret } from "./lib/tokens.js";
import { chatRouter } from "./modules/chat/chat.router.js";
import { moderationRouter } from "./modules/moderation/moderation.router.js";
import { nicknamesRouter } from "./modules/nicknames/nicknames.router.js";
import { playbackRouter } from "./modules/playback/playback.router.js";
import { queueRouter } from "./modules/queue/queue.router.js";
import { roomsRouter } from "./modules/rooms/rooms.router.js";
import { sessionsRouter } from "./modules/sessions/sessions.router.js";
import authPlugin from "./plugins/auth.js";
import prismaPlugin from "./plugins/prisma.js";
import rateLimitPlugin from "./plugins/rateLimit.js";
import redisPlugin from "./plugins/redis.js";
import { registerRealtime } from "./realtime/gateway.js";

export async function buildApp(config: ApiConfig) {
  const app = Fastify({
    logger: true,
    genReqId: () => nanoid(21),
    requestIdHeader: "X-Request-Id",
    requestIdLogLabel: "requestId",
  });

  await app.register(createConfigPlugin(config));
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError)
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error, requestId));

    if (error instanceof ZodError)
      return reply.status(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid request.",
          requestId,
          retryable: false,
          retryAfterSeconds: null,
          details: error.flatten(),
        },
      });

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong.",
        requestId,
        retryable: true,
        retryAfterSeconds: null,
      },
    });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/health/ready", async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    await app.redis.ping();
    return { ok: true };
  });

  await app.register(roomsRouter);
  await app.register(sessionsRouter);
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
  const config = loadConfig(process.env);
  setSecret(config.sessionSecret);
  const app = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
}
