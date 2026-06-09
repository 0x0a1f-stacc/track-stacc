import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { verifyPassword } from "../../lib/argon2.js";
import { AppError } from "../../lib/errors.js";
import {
  createRoomSchema,
  passwordVerifySchema,
  settingsSchema,
} from "./rooms.schema.js";
import { createRoom } from "./rooms.service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function roomsRouter(app: FastifyInstance) {
  app.post("/api/rooms", async (request, reply) => {
    const body = createRoomSchema.parse(request.body);
    const result = await createRoom(app, request.ip, body);
    reply.setCookie("host_token", result.hostToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: app.config.nodeEnv === "production",
    });
    reply.code(201);
    return {
      room: {
        id: result.room.id,
        slug: result.room.slug,
        name: result.room.name,
        playlistMechanic: result.room.playlistMechanic,
      },
      hostToken: result.hostToken,
    };
  });

  app.get("/api/rooms/:roomId", async (request) => {
    const { roomId } = request.params as { roomId: string };
    const room = await app.prisma.room.findFirst({
      where: uuidPattern.test(roomId)
        ? { OR: [{ id: roomId }, { slug: roomId }] }
        : { slug: roomId },
    });
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found.", 404);
    return { room };
  });

  app.patch("/api/rooms/:roomId/settings", async (request) => {
    if (
      !request.session ||
      !["host", "moderator"].includes(request.session.role)
    )
      throw new AppError(
        "FORBIDDEN",
        "Only hosts and moderators can update settings.",
        403,
      );
    const { roomId } = request.params as { roomId: string };
    const { settings } = settingsSchema.parse(request.body);
    const data = Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value !== undefined),
    ) as Prisma.RoomUpdateInput;
    const room = await app.prisma.room.update({
      where: { id: roomId },
      data,
    });
    await app.prisma.roomSettingsHistory.create({
      data: {
        roomId,
        actorSessionId: request.session.id,
        settingKey: "settings",
        oldValue: {},
        newValue: settings,
      },
    });
    return { room };
  });

  app.post("/api/rooms/:roomId/password/verify", async (request) => {
    const { roomId } = request.params as { roomId: string };
    const { roomPassword } = passwordVerifySchema.parse(request.body);
    const room = await app.prisma.room.findFirst({
      where: uuidPattern.test(roomId)
        ? { OR: [{ id: roomId }, { slug: roomId }] }
        : { slug: roomId },
    });
    if (!room?.roomPasswordHash) return { valid: true };
    return { valid: await verifyPassword(room.roomPasswordHash, roomPassword) };
  });
}
