import fp from "fastify-plugin";

import { AppError } from "../lib/errors.js";
import { hashToken } from "../lib/tokens.js";

export default fp(async (app) => {
  app.decorateRequest("session");
  app.addHook("preHandler", async (request) => {
    const token = request.cookies.session_token;
    if (!token) return;
    const session = await app.prisma.roomSession.findUnique({
      where: { sessionTokenHash: hashToken(token) },
    });
    if (!session) {
      request.log.warn({ sessionTokenHash: hashToken(token) }, "session not found");
      return;
    }
    if (session.isBanned) {
      request.log.warn({ sessionId: session.id }, "banned session attempted access");
      return;
    }
    request.session = session;
  });
});

export function requireSession(request: { session?: unknown }) {
  if (!request.session)
    throw new AppError(
      "AUTH_REQUIRED",
      "Join the room before doing that.",
      401,
    );
}
