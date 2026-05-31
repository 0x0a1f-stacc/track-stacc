import type { FastifyInstance } from "fastify";

import { AppError } from "../../lib/errors.js";

export async function chatRouter(app: FastifyInstance) {
  app.get("/api/rooms/:roomId/chat/messages", async (request) => {
    const { roomId } = request.params as { roomId: string };
    return {
      messages: await app.prisma.chatMessage.findMany({
        where: { roomId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    };
  });
  app.delete("/api/rooms/:roomId/chat/messages/:messageId", async (request) => {
    if (
      !request.session ||
      !["host", "moderator"].includes(request.session.role)
    )
      throw new AppError(
        "FORBIDDEN",
        "Only hosts and moderators can delete chat.",
        403,
      );
    const { messageId } = request.params as { messageId: string };
    return {
      message: await app.prisma.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), deletedBySessionId: request.session.id },
      }),
    };
  });
}
