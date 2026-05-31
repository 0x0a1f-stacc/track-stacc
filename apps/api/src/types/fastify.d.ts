import type { PrismaClient, RoomSession } from "@prisma/client";
import type { Redis } from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }
  interface FastifyRequest {
    session?: RoomSession;
  }
}
