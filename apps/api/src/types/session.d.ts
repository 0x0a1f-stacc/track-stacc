import "fastify";
import type { RoomSession } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    session?: RoomSession;
  }
}
