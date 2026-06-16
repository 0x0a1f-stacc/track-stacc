import type { FastifyInstance } from "fastify";

import { requireModerator } from "../../auth/guards.js";
import { AppError } from "../../lib/errors.js";
import { requireSession } from "../../plugins/auth.js";

export async function chatRouter(app: FastifyInstance) {
  app.get("/api/rooms/:roomId/chat/messages", async (request) => {
    requireSession(request);
    const session = request.session;
    if (!session) {
      throw new AppError("AUTH_REQUIRED", "Join the room before doing that.", 401);
    }
    const { roomId } = request.params as { roomId: string };
    if (session.roomId !== roomId) {
      throw new AppError("FORBIDDEN", "Join the room before doing that.", 403);
    }

    const room = await app.prisma.room.findUniqueOrThrow({
      where: { id: roomId },
    });

    const isListener = session.accessTier === "listener";
    const canSeeChat = !isListener || room.listenerChatVisible;

    const messages = canSeeChat
      ? await app.prisma.chatMessage.findMany({
          where: { roomId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            sender: {
              select: {
                displayNickname: true,
              },
            },
          },
        })
      : [];

    return {
      messages: messages.map((msg) => ({
        id: msg.id,
        roomId: msg.roomId,
        senderSessionId: msg.senderSessionId,
        senderNickname: msg.sender?.displayNickname ?? null,
        type: msg.messageType,
        body: msg.body,
        metadata: msg.metadata as Record<string, unknown>,
        deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
        createdAt: msg.createdAt.toISOString(),
      })),
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
