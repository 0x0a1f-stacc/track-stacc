import type { FastifyInstance } from "fastify";

import { requireModerator } from "../../auth/guards.js";

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
    const session = requireModerator(request.session);
    const { messageId } = request.params as { messageId: string };
    return {
      message: await app.prisma.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), deletedBySessionId: session.id },
      }),
    };
  });
}
