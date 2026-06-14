import type { FastifyInstance } from "fastify";

import { requireMember } from "../../auth/guards.js";
import { verifyPassword } from "../../lib/argon2.js";
import { AppError } from "../../lib/errors.js";
import { assertRateLimit, rateLimits } from "../../lib/rateLimit.js";
import { hashToken } from "../../lib/tokens.js";
import { broadcast } from "../../realtime/broadcast.js";
import { getParticipants } from "../../realtime/presence.manager.js";
import { normalizeNickname } from "../identity/nickname.normalizer.js";

import {
  joinRoomSchema,
  nicknameAuthSchema,
  nicknameCheckSchema,
  nicknameProtectSchema,
} from "./nicknames.schema.js";
import {
  checkNickname,
  joinRoom as joinRoomService,
  protectNickname,
} from "./nicknames.service.js";

export async function nicknamesRouter(app: FastifyInstance) {
  app.post("/api/nicknames/check", async (request) => {
    const body = nicknameCheckSchema.parse(request.body);
    const result = await checkNickname(app, body.displayNickname);
    return {
      normalizedNickname: result.normalizedNickname,
      protected: result.protected,
      available: true,
    };
  });
  app.post("/api/nicknames/protect", async (request) => {
    const body = nicknameProtectSchema.parse(request.body);
    const claim = await protectNickname(
      app,
      body.displayNickname,
      body.password,
    );
    return { id: claim.id, displayNickname: claim.displayNickname };
  });
  app.post("/api/nicknames/authenticate", async (request) => {
    const body = nicknameAuthSchema.parse(request.body);
    const normalized = normalizeNickname(body.displayNickname);
    const claim = await app.prisma.nicknameClaim.findFirst({
      where: {
        normalizedNickname: normalized.normalizedNickname,
        status: "active",
      },
    });
    if (!claim) {
      throw new AppError(
        "NICKNAME_PASSWORD_INCORRECT",
        "That nickname is protected. The password was incorrect.",
        403,
      );
    }
    try {
      await assertRateLimit(
        app.redis,
        `rl:nickname-auth:${normalized.normalizedNickname}`,
        rateLimits.nicknameAuth.max,
        rateLimits.nicknameAuth.windowMs,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "RATE_LIMITED") {
        throw new AppError(
          "NICKNAME_PASSWORD_RATE_LIMITED",
          "Too many incorrect attempts. Try again later.",
          429,
          undefined,
          true,
        );
      }
      throw error;
    }
    if (!(await verifyPassword(claim.passwordHash, body.password))) {
      throw new AppError(
        "NICKNAME_PASSWORD_INCORRECT",
        "That nickname is protected. The password was incorrect.",
        403,
      );
    }
    return {
      authenticated: true,
      id: claim.id,
      displayNickname: claim.displayNickname,
    };
  });
  app.post("/api/rooms/:roomId/join", async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const body = joinRoomSchema.parse(request.body);
    const result = await joinRoomService(app, {
      roomIdOrSlug: roomId,
      ...(body.displayNickname !== undefined && {
        displayNickname: body.displayNickname,
      }),
      ...(body.nicknamePassword !== undefined && {
        nicknamePassword: body.nicknamePassword,
      }),
      ...(body.roomPassword !== undefined && {
        roomPassword: body.roomPassword,
      }),
      ...(request.cookies.host_token !== undefined && {
        hostToken: request.cookies.host_token,
      }),
      ...(body.listenerSessionId !== undefined && {
        listenerSessionId: body.listenerSessionId,
      }),
    });
    reply.setCookie("session_token", result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    // Broadcast presence update after successful join/upgrade
    broadcast(app.io, result.session.roomId, {
      type: "presence.updated",
      participants: await getParticipants(app, result.session.roomId),
    });
    return {
      session: {
        roomSessionId: result.session.id,
        displayNickname: result.session.displayNickname,
        accessTier: "member" as const,
        role: result.session.role as "participant" | "moderator" | "host",
        protectedNickname: Boolean(result.session.nicknameClaimId),
      },
      websocketToken: result.websocketToken,
    };
  });
  app.post("/api/rooms/:roomId/nickname/change", async (request) => {
    const session = requireMember(request.session);
    const body = request.body as {
      displayNickname?: string;
      nicknamePassword?: string;
    };
    if (!body.displayNickname)
      throw new AppError(
        "VALIDATION_FAILED",
        "Display nickname is required.",
        400,
      );
    const normalized = normalizeNickname(body.displayNickname);
    const updated = await app.prisma.roomSession.update({
      where: { id: session.id },
      data: {
        ...normalized,
        sessionTokenHash: hashToken(request.cookies.session_token ?? ""),
      },
    });
    return { session: updated };
  });
}
