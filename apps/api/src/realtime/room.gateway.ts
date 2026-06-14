import {
  ChatMessageType,
  QueueItemStatus,
  type ClientEvent,
} from "@trackstacc/types";
import type { FastifyInstance } from "fastify";
import type { Socket, Server } from "socket.io";

import { AppError, toWsErrorAcknowledgement } from "../lib/errors.js";
import { chatSendSchema } from "../modules/chat/chat.schema.js";
import { sendChatMessage } from "../modules/chat/chat.service.js";
import {
  handleClientEnd,
  handleClientBuffering,
  maybeAutoStart,
  clearClientBuffering,
} from "../modules/playback/playback.coordinator.js";
import { clientPlaybackStateSchema } from "../modules/playback/playback.schema.js";
import {
  addQueueItemSchema,
  voteSchema,
} from "../modules/queue/queue.schema.js";
import { addQueueItem, voteQueueItem } from "../modules/queue/queue.service.js";

import { broadcast } from "./broadcast.js";
import { getParticipants, markSessionPresent, cleanupInactiveSessions } from "./presence.manager.js";
import { generateEventRequestId } from "./request-id.js";

const memberRequiredEventTypes = new Set([
  "chat.send",
  "queue.add",
  "queue.vote",
  "playback.skipVote",
  "room.settings.update",
  "room.mechanic.change",
  "moderation.action",
]);

export function registerRoomHandlers(
  app: FastifyInstance,
  io: Server,
  socket: Socket,
  roomId: string,
  sessionId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  socket.onAny(async (eventName: string, event: ClientEvent) => {
    const requestId = generateEventRequestId();
    const sendError = (error: Error) => {
      const appError =
        error instanceof AppError
          ? error
          : new AppError("INTERNAL_ERROR", "Action failed.");
      const ack = toWsErrorAcknowledgement(appError, eventName, requestId);
      socket.emit("error", { type: "error" as const, ...ack });
    };

    try {
      // Tier gate — enforce member tier for interactive events before
      // reading any event payload fields for authorization. Emit
      // synchronously from inside the handler (don't delegate to sendError
      // which lives in the catch block — Socket.IO swallows the error when
      // thrown inside an onAny callback and caught via the async catch).
      if (memberRequiredEventTypes.has(eventName)) {
        const sd = socket.data as { accessTier?: string };
        if (sd.accessTier !== "member") {
          const ack = toWsErrorAcknowledgement(
            new AppError(
              "LISTENER_READ_ONLY",
              "Join with a protected nickname to do that.",
              403,
            ),
            eventName,
            requestId,
          );
          socket.emit("error", { type: "error" as const, ...ack });
          return;
        }
      }

      if (event.type === "presence.heartbeat") {
        await app.prisma.roomSession.update({
          where: { id: sessionId },
          data: { lastSeenAt: new Date() },
        }).catch(() => undefined);
        await markSessionPresent(app, roomId, sessionId);
        await cleanupInactiveSessions(app, roomId);
        broadcast(io, roomId, {
          type: "presence.updated",
          participants: await getParticipants(app, roomId),
        });
      }
      if (event.type === "chat.send") {
        const body = chatSendSchema.parse(event);
        const message = await sendChatMessage(
          app,
          roomId,
          sessionId,
          body.body,
          body.tempId ? { tempId: body.tempId } : {},
        );
        const outbound = {
          id: message.id,
          roomId,
          senderSessionId: sessionId,
          senderNickname: null,
          type: ChatMessageType.User,
          body: message.body,
          metadata: {},
          deletedAt: null,
          createdAt: message.createdAt.toISOString(),
          ...(body.tempId ? { tempId: body.tempId } : {}),
        };
        broadcast(io, roomId, {
          type: "chat.message",
          message: outbound,
        });
      }
      if (event.type === "queue.add") {
        const body = addQueueItemSchema.parse(event);
        const item = await addQueueItem(
          app,
          roomId,
          sessionId,
          body.youtubeUrl,
        );
        broadcast(io, roomId, {
          type: "queue.item.added",
          item: {
            id: item.id,
            roomId,
            track: {
              provider: "youtube",
              videoId: item.track.providerVideoId,
              title: item.track.title,
              channelTitle: item.track.channelTitle,
              thumbnailUrl: item.track.thumbnailUrl,
              durationSeconds: item.track.durationSeconds,
            },
            addedBySessionId: sessionId,
            status: item.status as QueueItemStatus,
            position: item.position,
            score: item.score,
            mechanicContext: {},
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          },
        });
        if (item.status === "queued") await maybeAutoStart(app, io, roomId);
      }
      if (event.type === "queue.vote") {
        const body = voteSchema.parse(event);
        const item = await voteQueueItem(
          app,
          event.queueItemId,
          sessionId,
          body.vote,
        );
        broadcast(io, roomId, {
          type: "queue.vote.updated",
          queueItemId: item.id,
          score: item.score,
        });
      }
      if (event.type === "playback.clientState") {
        const body = clientPlaybackStateSchema.parse(event);
        if (body.status === "ended" && body.queueItemId)
          await handleClientEnd(app, io, roomId, body.queueItemId);
        if (body.status === "buffering" && body.queueItemId)
          await handleClientBuffering(app, io, roomId, body.queueItemId);
        if (body.status === "playing") clearClientBuffering(roomId);
      }
    } catch (error) {
      sendError(error as Error);
    }
  });
}
