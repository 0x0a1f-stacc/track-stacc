import type { PrismaClient, RoomSession } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Server } from "socket.io";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    io: Server;
  }
  interface FastifyRequest {
    session?: RoomSession;
  }
}
