import type { AddressInfo } from "node:net";

import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import { describe, it, expect, vi } from "vitest";

import { createConfigPlugin } from "../lib/config.js";
import type { ApiConfig } from "../lib/config.js";
import { setSecret, signWsToken, verifyWsToken } from "../lib/tokens.js";
import { registerRealtime } from "../realtime/gateway.js";
import { moderationRouter } from "../modules/moderation/moderation.router.js";

// No mock needed — gateway handles missing Redis adapter gracefully

const TEST_SECRET = "test-secret-for-testing-only-1234567890";
setSecret(TEST_SECRET);

const BASE_CONFIG: ApiConfig = {
  databaseUrl: "postgresql://test:test@localhost:5432/test",
  redisUrl: "redis://localhost:6379",
  sessionSecret: TEST_SECRET,
  corsOrigins: ["http://localhost:3000"],
  youtubeApiKey: null,
  port: 0,
  host: "0.0.0.0",
  nodeEnv: "test",
};

const ROOM_ID = "room-abc-123";
const SESSION_ID = "session-xyz-789";

function mockSession(overrides?: {
  accessTier?: string;
  role?: string;
  roomId?: string;
  isBanned?: boolean;
}) {
  const isMember = (overrides?.accessTier ?? "listener") === "member";
  return {
    id: SESSION_ID,
    roomId: overrides?.roomId ?? ROOM_ID,
    accessTier: overrides?.accessTier ?? "listener",
    role: overrides?.role ?? "listener",
    normalizedNickname: isMember ? "membername" : null,
    displayNickname: isMember ? "MemberName" : null,
    nicknameClaimId: isMember ? "claim-xyz" : null,
    sessionTokenHash: "hashed-token",
    isMuted: false,
    isBanned: overrides?.isBanned ?? false,
    joinedAt: new Date(),
    lastSeenAt: new Date(),
    leftAt: null,
  };
}

function mockRoom(overrides?: { listenerChatVisible?: boolean }) {
  return {
    id: ROOM_ID,
    slug: "test-room",
    name: "Test Room",
    description: null,
    visibility: "private_link" as const,
    roomPasswordHash: null,
    hostSecretHash: "$argon2id$salt$hash",
    playlistMechanic: "fifo" as const,
    maxSongDurationSeconds: 600,
    duplicatePolicy: "block_queue" as const,
    skipVoteThresholdType: "percentage" as const,
    skipVoteThresholdValue: 50,
    queueLocked: false,
    chatLocked: false,
    listenerChatVisible: overrides?.listenerChatVisible ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    lastActiveAt: new Date(),
  };
}

function mockChatMessages(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    roomId: ROOM_ID,
    senderSessionId: SESSION_ID,
    messageType: "user" as const,
    body: `Message ${i}`,
    metadata: {},
    deletedAt: null,
    createdAt: new Date(),
    sender: {
      displayNickname: "MemberName",
    },
  }));
}

function mockQueueItems(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `queue-${i}`,
    roomId: ROOM_ID,
    trackId: `track-${i}`,
    addedBySessionId: SESSION_ID,
    status: i === 0 ? ("playing" as const) : ("queued" as const),
    position: i,
    score: 10 - i,
    mechanicContext: {},
    startedAt: null,
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    track: {
      id: `track-${i}`,
      provider: "youtube" as const,
      providerVideoId: `video-${i}`,
      title: `Track ${i}`,
      channelTitle: `Channel ${i}`,
      thumbnailUrl: `https://img.youtube.com/vi/video-${i}/default.jpg`,
      durationSeconds: 180,
      isEmbeddable: true,
      metadataStatus: "complete" as const,
      metadataFetchedAt: new Date(),
      createdAt: new Date(),
    },
  }));
}

async function setupTest(overrides?: {
  listenerChatVisible?: boolean;
  accessTier?: string;
  role?: string;
  sessionRoomId?: string;
  sessionBanned?: boolean;
}) {
  const app = Fastify({ logger: false });
  app.register(createConfigPlugin(BASE_CONFIG));
  app.register(cookie);

  app.decorate("redis", {
    duplicate: vi
      .fn()
      .mockReturnValue({ quit: vi.fn().mockResolvedValue(undefined) }),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue("PONG"),
    zadd: vi.fn().mockResolvedValue(1),
    zrem: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
  } as never);

  const session = mockSession(
    overrides
      ? {
          ...(overrides.accessTier !== undefined && {
            accessTier: overrides.accessTier,
          }),
          ...(overrides.role !== undefined && { role: overrides.role }),
          ...(overrides.sessionRoomId !== undefined && {
            roomId: overrides.sessionRoomId,
          }),
          ...(overrides.sessionBanned !== undefined && {
            isBanned: overrides.sessionBanned,
          }),
        }
      : undefined,
  );

  const room = mockRoom(
    overrides?.listenerChatVisible !== undefined
      ? { listenerChatVisible: overrides.listenerChatVisible }
      : undefined,
  );

  const mockPrisma = {
    roomSession: {
      findUnique: vi.fn().mockResolvedValue(session),
      findFirst: vi.fn().mockResolvedValue(session),
      findMany: vi.fn().mockResolvedValue([session]),
      update: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    room: {
      findUnique: vi.fn().mockResolvedValue(room),
      findUniqueOrThrow: vi.fn().mockResolvedValue(room),
    },
    queueItem: {
      findMany: vi.fn().mockResolvedValue(mockQueueItems(2)),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue(mockChatMessages(3)),
      create: vi.fn().mockImplementation(
        (args: {
          data: {
            roomId: string;
            senderSessionId?: string | null;
            messageType?: "user" | "system";
            body: string;
            metadata?: Record<string, unknown> | null;
          };
        }) => {
          const data = args.data;
          return Promise.resolve({
            id: "msg-created-123",
            roomId: data.roomId,
            senderSessionId: data.senderSessionId ?? null,
            messageType: data.messageType ?? "user",
            body: data.body,
            metadata: data.metadata ?? {},
            deletedAt: null,
            createdAt: new Date(),
            sender: session.displayNickname
              ? { displayNickname: session.displayNickname }
              : null,
          });
        },
      ),
    },
    roomModerationAction: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]),
  };
  app.decorate("prisma", mockPrisma as never);
  app.decorate("io", null as any);

  // Hook to bypass cookie auth lookup by setting session directly
  app.addHook("preHandler", async (request) => {
    request.session = session as never;
  });

  await app.register(moderationRouter);

  await app.ready();
  const io = await registerRealtime(app);
  app.io = io;
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as AddressInfo).port;

  return { app, io, port, session, room };
}

async function teardownTest(io: Server, app: FastifyInstance) {
  await io.close();
  try {
    await app.close();
  } catch {
    // ignore close errors
  }
}

function connectClient(
  port: number,
  token: string,
): Promise<{ client: ReturnType<typeof ioc>; data: unknown }> {
  return new Promise((resolve, reject) => {
    const client = ioc(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error("timeout waiting for room.snapshot"));
    }, 3000);
    client.on("room.snapshot", (data) => {
      clearTimeout(timeout);
      resolve({ client, data });
    });
    client.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function connectClientExpectError(
  port: number,
  token: string,
): Promise<{ client: ReturnType<typeof ioc>; error: Error }> {
  return new Promise((resolve, reject) => {
    const client = ioc(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error("timeout waiting for error"));
    }, 3000);
    client.on("room.snapshot", () => {
      clearTimeout(timeout);
      client.close();
      reject(new Error("expected connection error but got snapshot"));
    });
    client.on("connect_error", (err) => {
      clearTimeout(timeout);
      resolve({ client, error: err });
    });
  });
}

describe("WebSocket gateway", () => {
  describe("valid listener token", () => {
    it("connects and receives room.snapshot", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
        listenerChatVisible: true,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as { payload: Record<string, unknown> };
      expect(snapshot).toBeDefined();
      expect(snapshot.payload).toBeDefined();
      expect(snapshot.payload.room).toBeDefined();
      expect(snapshot.payload.currentPlayback).toBeDefined();
      expect(snapshot.payload.queue).toBeDefined();
      expect(snapshot.payload.participants).toBeDefined();
      expect(snapshot.payload.recentMessages).toBeDefined();
    });

    it("includes recentMessages when listenerChatVisible is true", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
        listenerChatVisible: true,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as { payload: { recentMessages: unknown[] } };
      expect(snapshot.payload.recentMessages.length).toBeGreaterThan(0);
    });

    it("omits recentMessages when listenerChatVisible is false", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
        listenerChatVisible: false,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as { payload: { recentMessages: unknown[] } };
      expect(snapshot.payload.recentMessages).toEqual([]);
    });

    it("does not expose sensitive fields in snapshot room", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
        listenerChatVisible: true,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as { payload: { room: Record<string, unknown> } };
      const room = snapshot.payload.room;
      expect(room.id).toBeDefined();
      expect(room.slug).toBeDefined();
      expect(room.name).toBeDefined();
      expect(room.roomPasswordHash).toBeUndefined();
      expect(room.hostSecretHash).toBeUndefined();
      expect(room.passwordHash).toBeUndefined();
    });
  });

  describe("member token", () => {
    it("includes recentMessages even when listenerChatVisible is false", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "member",
        role: "participant",
        listenerChatVisible: false,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "member",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as { payload: { recentMessages: unknown[] } };
      expect(snapshot.payload.recentMessages.length).toBeGreaterThan(0);
    });

    it("resolves correct senderNickname in snapshot recentMessages", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "member",
        role: "participant",
        listenerChatVisible: false,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "member",
      });

      const { client, data } = await connectClient(port, token);
      client.close();
      await teardownTest(io, app);

      const snapshot = data as {
        payload: { recentMessages: Array<{ senderNickname: string | null }> };
      };
      expect(snapshot.payload.recentMessages.length).toBeGreaterThan(0);
      for (const msg of snapshot.payload.recentMessages) {
        expect(msg.senderNickname).toBe("MemberName");
      }
    });

    it("broadcasts chat.message with senderNickname to clients", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "member",
        role: "participant",
        listenerChatVisible: true,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "member",
      });

      const { client } = await connectClient(port, token);

      const messagePromise = new Promise<{
        message: { senderNickname: string | null };
      }>((resolve, reject) => {
        client.on("chat.message", (data: unknown) => {
          resolve(data as { message: { senderNickname: string | null } });
        });
        client.on("error", (err: unknown) => {
          reject(new Error(`Socket error: ${JSON.stringify(err)}`));
        });
      });

      client.emit("chat.send", {
        type: "chat.send",
        body: "Hello World",
        tempId: "temp-123",
      });

      const received = await messagePromise;
      client.close();
      await teardownTest(io, app);

      expect(received.message).toBeDefined();
      expect(received.message.senderNickname).toBe("MemberName");
    });
  });

  describe("invalid token rejection", () => {
    it("rejects connection with error for bad token", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
      });

      const { error } = await connectClientExpectError(port, "bad-token");
      await teardownTest(io, app);

      expect(error.message).toBeTruthy();
    });

    it("rejects connection when session is not found", async () => {
      const app = Fastify({ logger: false });
      app.register(createConfigPlugin(BASE_CONFIG));
      app.register(cookie);

      app.decorate("redis", {
        duplicate: vi
          .fn()
          .mockReturnValue({ quit: vi.fn().mockResolvedValue(undefined) }),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        incr: vi.fn().mockResolvedValue(1),
        pexpire: vi.fn().mockResolvedValue(1),
        ping: vi.fn().mockResolvedValue("PONG"),
      } as never);

      app.decorate("prisma", {
        roomSession: {
          findUnique: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as never);

      await app.ready();
      const io = await registerRealtime(app);
      await app.listen({ port: 0, host: "127.0.0.1" });
      const port = (app.server.address() as AddressInfo).port;

      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { error } = await connectClientExpectError(port, token);
      await teardownTest(io, app);

      expect(error.message).toBeTruthy();
    });

    it("rejects connection when session is banned", async () => {
      const { app, io, port } = await setupTest({
        accessTier: "listener",
        sessionBanned: true,
      });
      const token = signWsToken({
        roomId: ROOM_ID,
        sessionId: SESSION_ID,
        accessTier: "listener",
      });

      const { error } = await connectClientExpectError(port, token);
      await teardownTest(io, app);

      expect(error.message).toBeTruthy();
    });
  });

  describe("direct token verification", () => {
    it("verifyWsToken throws error for malformed token", () => {
      expect(() => verifyWsToken("bad-token")).toThrow();
    });

    it("verifyWsToken throws error for expired token", () => {
      const token = signWsToken(
        { roomId: "x", sessionId: "y", accessTier: "listener" },
        -1,
      );
      expect(() => verifyWsToken(token)).toThrow();
    });
  });

  describe("Segmented chat channel routing", () => {
    function mockSessionWithId(id: string, accessTier: string) {
      const isMember = accessTier === "member";
      return {
        id,
        roomId: ROOM_ID,
        accessTier,
        role: isMember ? "participant" : "listener",
        normalizedNickname: isMember ? "membername" : null,
        displayNickname: isMember ? "MemberName" : null,
        nicknameClaimId: isMember ? "claim-xyz" : null,
        sessionTokenHash: "hashed-token",
        isMuted: false,
        isBanned: false,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
        leftAt: null,
      };
    }

    it("does not deliver chat.message or chat.deleted to listener when listenerChatVisible is false", async () => {
      const { app, io, port } = await setupTest({
        listenerChatVisible: false,
      });

      app.prisma.roomSession.findUnique = vi
        .fn()
        .mockImplementation((args: { where: { id: string } }) => {
          if (args.where.id === "session-member") {
            return Promise.resolve(
              mockSessionWithId("session-member", "member"),
            );
          }
          return Promise.resolve(
            mockSessionWithId("session-listener", "listener"),
          );
        });

      const memberToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-member",
        accessTier: "member",
      });
      const listenerToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener",
        accessTier: "listener",
      });

      const { client: memberClient } = await connectClient(port, memberToken);
      const { client: listenerClient } = await connectClient(
        port,
        listenerToken,
      );

      let memberReceived = false;
      let listenerReceived = false;
      let listenerReceivedDeleted = false;

      memberClient.on("chat.message", () => {
        memberReceived = true;
      });
      listenerClient.on("chat.message", () => {
        listenerReceived = true;
      });
      listenerClient.on("chat.deleted", () => {
        listenerReceivedDeleted = true;
      });

      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "Hello Room",
        tempId: "temp-1",
      });

      const { broadcast } = await import("../realtime/broadcast.js");
      broadcast(io, ROOM_ID, { type: "chat.deleted", messageId: "msg-1" });

      await new Promise((resolve) => setTimeout(resolve, 150));

      memberClient.close();
      listenerClient.close();
      await teardownTest(io, app);

      expect(memberReceived).toBe(true);
      expect(listenerReceived).toBe(false);
      expect(listenerReceivedDeleted).toBe(false);
    });

    it("delivers chat.message and chat.deleted to listener when listenerChatVisible is true", async () => {
      const { app, io, port } = await setupTest({
        listenerChatVisible: true,
      });

      app.prisma.roomSession.findUnique = vi
        .fn()
        .mockImplementation((args: { where: { id: string } }) => {
          if (args.where.id === "session-member") {
            return Promise.resolve(
              mockSessionWithId("session-member", "member"),
            );
          }
          return Promise.resolve(
            mockSessionWithId("session-listener", "listener"),
          );
        });

      const memberToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-member",
        accessTier: "member",
      });
      const listenerToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener",
        accessTier: "listener",
      });

      const { client: memberClient } = await connectClient(port, memberToken);
      const { client: listenerClient } = await connectClient(
        port,
        listenerToken,
      );

      let memberReceived = false;
      let listenerReceived = false;
      let listenerReceivedDeleted = false;

      memberClient.on("chat.message", () => {
        memberReceived = true;
      });
      listenerClient.on("chat.message", () => {
        listenerReceived = true;
      });
      listenerClient.on("chat.deleted", () => {
        listenerReceivedDeleted = true;
      });

      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "Hello Room Visible",
        tempId: "temp-2",
      });

      const { broadcast } = await import("../realtime/broadcast.js");
      broadcast(io, ROOM_ID, { type: "chat.deleted", messageId: "msg-2" });

      await new Promise((resolve) => setTimeout(resolve, 150));

      memberClient.close();
      listenerClient.close();
      await teardownTest(io, app);

      expect(memberReceived).toBe(true);
      expect(listenerReceived).toBe(true);
      expect(listenerReceivedDeleted).toBe(true);
    });

    it("toggling listenerChatVisible from false to true dynamically joins connected listener sockets", async () => {
      const { app, io, port } = await setupTest({
        listenerChatVisible: false,
      });

      app.prisma.roomSession.findUnique = vi
        .fn()
        .mockImplementation((args: { where: { id: string } }) => {
          if (args.where.id === "session-member") {
            return Promise.resolve(
              mockSessionWithId("session-member", "member"),
            );
          }
          return Promise.resolve(
            mockSessionWithId("session-listener", "listener"),
          );
        });

      const memberToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-member",
        accessTier: "member",
      });
      const listenerToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener",
        accessTier: "listener",
      });

      const { client: memberClient } = await connectClient(port, memberToken);
      const { client: listenerClient } = await connectClient(
        port,
        listenerToken,
      );

      let memberChats = 0;
      let listenerChats = 0;

      memberClient.on("chat.message", () => {
        memberChats++;
      });
      listenerClient.on("chat.message", () => {
        listenerChats++;
      });

      // Phase 1: chat before toggle — listener should NOT receive
      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "Before toggle",
        tempId: "temp-before-toggle-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(memberChats).toBe(1);
      expect(listenerChats).toBe(0);

      // Phase 2: toggle visibility ON
      const { syncListenerChatChannelMembership } =
        await import("../realtime/broadcast.js");
      await syncListenerChatChannelMembership(io, ROOM_ID, true);

      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "After toggle",
        tempId: "temp-after-toggle-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));

      memberClient.close();
      listenerClient.close();
      await teardownTest(io, app);

      expect(memberChats).toBe(2);
      expect(listenerChats).toBe(1);
    });

    it("toggling listenerChatVisible from true to false dynamically removes connected listener sockets from chat delivery", async () => {
      const { app, io, port } = await setupTest({
        listenerChatVisible: true,
      });

      app.prisma.roomSession.findUnique = vi
        .fn()
        .mockImplementation((args: { where: { id: string } }) => {
          if (args.where.id === "session-member") {
            return Promise.resolve(
              mockSessionWithId("session-member", "member"),
            );
          }
          return Promise.resolve(
            mockSessionWithId("session-listener", "listener"),
          );
        });

      const memberToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-member",
        accessTier: "member",
      });
      const listenerToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener",
        accessTier: "listener",
      });

      const { client: memberClient } = await connectClient(port, memberToken);
      const { client: listenerClient } = await connectClient(
        port,
        listenerToken,
      );

      let memberChats = 0;
      let listenerChats = 0;

      memberClient.on("chat.message", () => {
        memberChats++;
      });
      listenerClient.on("chat.message", () => {
        listenerChats++;
      });

      // Phase 1: chat before toggle — both should receive
      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "Before toggle",
        tempId: "temp-before-toggle-2",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(memberChats).toBe(1);
      expect(listenerChats).toBe(1);

      // Phase 2: toggle visibility OFF
      const { syncListenerChatChannelMembership } =
        await import("../realtime/broadcast.js");
      await syncListenerChatChannelMembership(io, ROOM_ID, false);

      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "After toggle",
        tempId: "temp-after-toggle-2",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));

      memberClient.close();
      listenerClient.close();
      await teardownTest(io, app);

      expect(memberChats).toBe(2);
      expect(listenerChats).toBe(1);
    });

    it("toggling listenerChatVisible synced across multiple listener sockets", async () => {
      const { app, io, port } = await setupTest({
        listenerChatVisible: false,
      });

      app.prisma.roomSession.findUnique = vi
        .fn()
        .mockImplementation((args: { where: { id: string } }) => {
          if (args.where.id === "session-member") {
            return Promise.resolve(
              mockSessionWithId("session-member", "member"),
            );
          }
          if (args.where.id === "session-listener-1") {
            return Promise.resolve(
              mockSessionWithId("session-listener-1", "listener"),
            );
          }
          return Promise.resolve(
            mockSessionWithId("session-listener-2", "listener"),
          );
        });

      const memberToken = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-member",
        accessTier: "member",
      });
      const listener1Token = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener-1",
        accessTier: "listener",
      });
      const listener2Token = signWsToken({
        roomId: ROOM_ID,
        sessionId: "session-listener-2",
        accessTier: "listener",
      });

      const { client: memberClient } = await connectClient(port, memberToken);
      const { client: listener1Client } = await connectClient(
        port,
        listener1Token,
      );
      const { client: listener2Client } = await connectClient(
        port,
        listener2Token,
      );

      let memberChats = 0;
      let listener1Chats = 0;
      let listener2Chats = 0;

      memberClient.on("chat.message", () => {
        memberChats++;
      });
      listener1Client.on("chat.message", () => {
        listener1Chats++;
      });
      listener2Client.on("chat.message", () => {
        listener2Chats++;
      });

      // Toggle ON — both listeners should join chat channel
      const { syncListenerChatChannelMembership } =
        await import("../realtime/broadcast.js");
      await syncListenerChatChannelMembership(io, ROOM_ID, true);

      memberClient.emit("chat.send", {
        type: "chat.send",
        body: "After toggle",
        tempId: "temp-multi-toggle",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(memberChats).toBe(1);
      expect(listener1Chats).toBe(1);
      expect(listener2Chats).toBe(1);
    });
  });

  describe("moderation side effects", () => {
    const TARGET_SESSION_ID = "da27e69f-ccd2-4a50-b72d-f34def26d17a";

    function mockSessionWithDetails(id: string, accessTier: string, role: string, isMuted = false, isBanned = false) {
      const isMember = accessTier === "member";
      return {
        id,
        roomId: ROOM_ID,
        accessTier,
        role,
        normalizedNickname: isMember ? "targetname" : null,
        displayNickname: isMember ? "TargetName" : null,
        nicknameClaimId: isMember ? `claim-${id}` : null,
        sessionTokenHash: `hashed-${id}`,
        isMuted,
        isBanned,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
        leftAt: null,
      };
    }

    it("muting and unmuting a participant broadcasts moderation.applied and presence.updated", async () => {
      const { app, io, port, session: hostSession } = await setupTest({
        role: "host",
        accessTier: "member",
      });

      const targetSession = mockSessionWithDetails(TARGET_SESSION_ID, "member", "participant");

      app.prisma.roomSession.findUnique = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        if (args.where.id === hostSession.id) return Promise.resolve(hostSession);
        if (args.where.id === TARGET_SESSION_ID) return Promise.resolve(targetSession);
        return Promise.resolve(null);
      });
      app.prisma.roomSession.findFirst = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        if (args.where.id === TARGET_SESSION_ID) return Promise.resolve(targetSession);
        return Promise.resolve(null);
      });
      app.prisma.roomSession.findMany = vi.fn().mockResolvedValue([hostSession, targetSession]);

      const hostToken = signWsToken({ roomId: ROOM_ID, sessionId: hostSession.id, accessTier: "member" });
      const targetToken = signWsToken({ roomId: ROOM_ID, sessionId: TARGET_SESSION_ID, accessTier: "member" });

      const { client: hostClient } = await connectClient(port, hostToken);
      const { client: targetClient } = await connectClient(port, targetToken);

      const hostEvents: any[] = [];
      const targetEvents: any[] = [];

      hostClient.on("moderation.applied", (payload) => hostEvents.push({ type: "moderation.applied", payload }));
      hostClient.on("presence.updated", (payload) => hostEvents.push({ type: "presence.updated", payload }));

      targetClient.on("moderation.applied", (payload) => targetEvents.push({ type: "moderation.applied", payload }));
      targetClient.on("presence.updated", (payload) => targetEvents.push({ type: "presence.updated", payload }));

      const mutedTarget = { ...targetSession, isMuted: true };
      app.prisma.roomSession.update = vi.fn().mockResolvedValue(mutedTarget);
      app.prisma.roomSession.findMany = vi.fn().mockResolvedValue([hostSession, mutedTarget]);

      hostEvents.length = 0;
      targetEvents.length = 0;

      const muteRes = await app.inject({
        method: "POST",
        url: `/api/rooms/${ROOM_ID}/moderation/mute`,
        payload: { targetSessionId: TARGET_SESSION_ID, reason: "disruptive" },
      });

      expect(muteRes.statusCode).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const hostMuteApplied = hostEvents.find(e => e.type === "moderation.applied");
      const hostPresenceUpdated = hostEvents.find(
        e => e.type === "presence.updated" && e.payload.participants.find((p: any) => p.roomSessionId === TARGET_SESSION_ID)?.isMuted === true
      );
      expect(hostMuteApplied).toBeDefined();
      expect(hostMuteApplied.payload.payload.action).toBe("mute");
      expect(hostMuteApplied.payload.payload.targetSessionId).toBe(TARGET_SESSION_ID);
      expect(hostMuteApplied.payload.payload.reason).toBe("disruptive");

      expect(hostPresenceUpdated).toBeDefined();
      expect(hostPresenceUpdated.payload.participants.find((p: any) => p.roomSessionId === TARGET_SESSION_ID).isMuted).toBe(true);

      expect(targetEvents.find(e => e.type === "moderation.applied")).toBeDefined();

      const unmutedTarget = { ...targetSession, isMuted: false };
      app.prisma.roomSession.update = vi.fn().mockResolvedValue(unmutedTarget);
      app.prisma.roomSession.findMany = vi.fn().mockResolvedValue([hostSession, unmutedTarget]);

      hostEvents.length = 0;
      targetEvents.length = 0;

      const unmuteRes = await app.inject({
        method: "POST",
        url: `/api/rooms/${ROOM_ID}/moderation/unmute`,
        payload: { targetSessionId: TARGET_SESSION_ID },
      });

      expect(unmuteRes.statusCode).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const hostUnmuteApplied = hostEvents.find(e => e.type === "moderation.applied");
      const hostUnmutePresence = hostEvents.find(
        e => e.type === "presence.updated" && e.payload.participants.find((p: any) => p.roomSessionId === TARGET_SESSION_ID)?.isMuted === false
      );
      expect(hostUnmuteApplied).toBeDefined();
      expect(hostUnmuteApplied.payload.payload.action).toBe("unmute");
      expect(hostUnmutePresence).toBeDefined();
      expect(hostUnmutePresence.payload.participants.find((p: any) => p.roomSessionId === TARGET_SESSION_ID).isMuted).toBe(false);

      hostClient.close();
      targetClient.close();
      await teardownTest(io, app);
    });

    it("banning a participant immediately disconnects active sockets (including multi-tab) and evicts Redis presence", async () => {
      const { app, io, port, session: hostSession } = await setupTest({
        role: "host",
        accessTier: "member",
      });

      const targetSession = mockSessionWithDetails(TARGET_SESSION_ID, "member", "participant");

      app.prisma.roomSession.findUnique = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        if (args.where.id === hostSession.id) return Promise.resolve(hostSession);
        if (args.where.id === TARGET_SESSION_ID) return Promise.resolve(targetSession);
        return Promise.resolve(null);
      });
      app.prisma.roomSession.findFirst = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        if (args.where.id === TARGET_SESSION_ID) return Promise.resolve(targetSession);
        return Promise.resolve(null);
      });

      const bannedTarget = { ...targetSession, isBanned: true, leftAt: new Date() };
      app.prisma.roomSession.update = vi.fn().mockResolvedValue(bannedTarget);
      app.prisma.roomSession.findMany = vi.fn().mockResolvedValue([hostSession]);

      const hostToken = signWsToken({ roomId: ROOM_ID, sessionId: hostSession.id, accessTier: "member" });
      const targetToken = signWsToken({ roomId: ROOM_ID, sessionId: TARGET_SESSION_ID, accessTier: "member" });

      const { client: hostClient } = await connectClient(port, hostToken);
      const { client: targetClient1 } = await connectClient(port, targetToken);
      const { client: targetClient2 } = await connectClient(port, targetToken);

      const hostEvents: any[] = [];
      hostClient.on("moderation.applied", (payload) => hostEvents.push({ type: "moderation.applied", payload }));
      hostClient.on("presence.updated", (payload) => hostEvents.push({ type: "presence.updated", payload }));

      let disc1 = false;
      let disc2 = false;
      targetClient1.on("disconnect", () => { disc1 = true; });
      targetClient2.on("disconnect", () => { disc2 = true; });

      const banRes = await app.inject({
        method: "POST",
        url: `/api/rooms/${ROOM_ID}/moderation/ban`,
        payload: { targetSessionId: TARGET_SESSION_ID, reason: "spamming" },
      });

      expect(banRes.statusCode).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(disc1).toBe(true);
      expect(disc2).toBe(true);

      expect(app.redis.zrem).toHaveBeenCalledWith(`room:${ROOM_ID}:presence`, TARGET_SESSION_ID);

      const hostBanApplied = hostEvents.find(e => e.type === "moderation.applied");
      const hostPresenceUpdated = hostEvents.find(e => e.type === "presence.updated");
      expect(hostBanApplied).toBeDefined();
      expect(hostBanApplied.payload.payload.action).toBe("ban");
      expect(hostBanApplied.payload.payload.targetSessionId).toBe(TARGET_SESSION_ID);

      expect(hostPresenceUpdated).toBeDefined();
      const targetInParticipants = hostPresenceUpdated.payload.participants.find((p: any) => p.roomSessionId === TARGET_SESSION_ID);
      expect(targetInParticipants).toBeUndefined();

      hostClient.close();
      await teardownTest(io, app);
    });

    it("banned sockets cannot reconnect", async () => {
      const { app, io, port, session: hostSession } = await setupTest({
        role: "host",
        accessTier: "member",
      });

      const targetSession = mockSessionWithDetails(TARGET_SESSION_ID, "member", "participant", false, true);

      app.prisma.roomSession.findUnique = vi.fn().mockImplementation((args: { where: { id: string } }) => {
        if (args.where.id === hostSession.id) return Promise.resolve(hostSession);
        if (args.where.id === TARGET_SESSION_ID) return Promise.resolve(targetSession);
        return Promise.resolve(null);
      });

      const targetToken = signWsToken({ roomId: ROOM_ID, sessionId: TARGET_SESSION_ID, accessTier: "member" });

      await expect(connectClient(port, targetToken)).rejects.toThrow();

      await teardownTest(io, app);
    });
  });
});
