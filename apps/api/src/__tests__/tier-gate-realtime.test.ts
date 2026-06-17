import {
  ChatMessageType,
  PlaylistMechanic,
  type ClientEvent,
} from "@trackstacc/types";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Socket, Server } from "socket.io";
import { describe, it, expect, vi } from "vitest";

import { createConfigPlugin } from "../lib/config.js";
import {
  broadcast,
  syncListenerChatChannelMembership,
} from "../realtime/broadcast.js";
import { registerRoomHandlers } from "../realtime/room.gateway.js";

// ---------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------

function buildMinimalApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(
    createConfigPlugin({
      databaseUrl: "postgresql://test:test@localhost:5432/test",
      redisUrl: "redis://localhost:6379",
      sessionSecret: "test-secret-for-testing-only-1234567890",
      corsOrigins: ["http://localhost:3000"],
      youtubeApiKey: null,
      port: 3000,
      host: "0.0.0.0",
      nodeEnv: "test",
    }),
  );

  app.decorate("prisma", {
    roomSession: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    queueItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    room: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    chatMessage: {
      create: vi.fn().mockResolvedValue({}),
    },
    $disconnect: vi.fn(),
  } as never);

  return app;
}

function buildRegisteredHandlers(
  app: FastifyInstance,
  accessTier: string,
): {
  emitEvent: (event: ClientEvent) => Promise<void>;
  emitMock: ReturnType<typeof vi.fn>;
} {
  const emitMock = vi.fn();
  const onAnyCallbacks: Array<
    (eventName: string, event: ClientEvent) => Promise<void>
  > = [];

  const mockSocket = {
    data: { accessTier },
    onAny: (cb: (eventName: string, event: ClientEvent) => Promise<void>) => {
      onAnyCallbacks.push(cb);
    },
    emit: emitMock,
  } as unknown as Socket;

  const mockIo = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server;

  registerRoomHandlers(app, mockIo, mockSocket, "room-abc-123", "session-1");

  return {
    emitEvent: async (event: ClientEvent) => {
      await onAnyCallbacks[0]!(event.type, event);
    },
    emitMock,
  };
}

// ---------------------------------------------------------------------------
// Listener rejection — implemented interactive events
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — listener rejection (implemented events)", () => {
  it("listener emits chat.send → receives LISTENER_READ_ONLY error", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({ type: "chat.send", body: "hello" });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({
        type: "error",
        ok: false,
        sourceEvent: "chat.send",
        code: "LISTENER_READ_ONLY",
      }),
    );
    await app.close();
  });

  it("listener emits queue.add → receives LISTENER_READ_ONLY error", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({
        type: "error",
        sourceEvent: "queue.add",
        code: "LISTENER_READ_ONLY",
      }),
    );
    await app.close();
  });

  it("listener emits queue.vote → receives LISTENER_READ_ONLY error", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "queue.vote",
      queueItemId: "item-1",
      vote: 1,
    });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({
        type: "error",
        sourceEvent: "queue.vote",
        code: "LISTENER_READ_ONLY",
      }),
    );
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Listener rejection — known unimplemented interactive events
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — listener rejection (unimplemented events)", () => {
  it("listener emits playback.skipVote → LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({ type: "playback.skipVote" });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });

  it("listener emits room.settings.update → LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "room.settings.update",
      settings: { queueLocked: true },
    });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });

  it("listener emits room.mechanic.change → LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "room.mechanic.change",
      mechanic: PlaylistMechanic.FIFO,
    });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });

  it("listener emits moderation.action → LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "moderation.action",
      action: { action: "mute", targetSessionId: "target-1" },
    });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Listener-allowed events
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — listener-allowed events", () => {
  it("listener emits presence.heartbeat → no LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({ type: "presence.heartbeat" });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });

  it("listener emits playback.clientState → no LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "playback.clientState",
      status: "playing",
      positionSeconds: 30,
    });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Member pass-through
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — member pass-through", () => {
  it("member socket does not receive LISTENER_READ_ONLY for chat.send", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "member");

    await emitEvent({ type: "chat.send", body: "hello" });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });

  it("member socket does not receive LISTENER_READ_ONLY for queue.add", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "member");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });

  it("member socket does not receive LISTENER_READ_ONLY for queue.vote", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "member");

    await emitEvent({
      type: "queue.vote",
      queueItemId: "item-1",
      vote: 1,
    });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Payload spoofing
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — payload spoofing", () => {
  it("listener with body.accessTier=member still receives LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "chat.send",
      body: "hello",
      accessTier: "member",
      role: "host",
    } as unknown as ClientEvent);

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });

  it("listener with body.role=host on queue.add still receives LISTENER_READ_ONLY", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({
      type: "queue.add",
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      role: "host",
      isHost: true,
    } as unknown as ClientEvent);

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Token fallback — gateway stores DB session accessTier when token lacks it
// ---------------------------------------------------------------------------

describe("WebSocket tier gate — legacy token fallback", () => {
  it("socket.data.accessTier from listener session enforces the gate", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "listener");

    await emitEvent({ type: "chat.send", body: "test" });

    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });

  it("socket.data.accessTier from member session passes the gate", async () => {
    const app = buildMinimalApp();
    const { emitEvent, emitMock } = buildRegisteredHandlers(app, "member");

    await emitEvent({ type: "chat.send", body: "test" });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Broadcast routing — chat events go to room:roomId:chat channel
// ---------------------------------------------------------------------------

describe("broadcast — chat event channel routing (Issue #82)", () => {
  function buildMockIo() {
    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    return { io: { to: toMock } as unknown as Server, emitMock, toMock };
  }

  it("routes chat.message to room:roomId:chat channel", () => {
    const { io, emitMock, toMock } = buildMockIo();
    broadcast(io, "room-abc", {
      type: "chat.message",
      message: {
        id: "m1",
        roomId: "room-abc",
        senderSessionId: "s1",
        senderNickname: "User",
        type: ChatMessageType.User,
        body: "hello",
        metadata: {},
        deletedAt: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    });
    expect(toMock).toHaveBeenCalledWith("room:room-abc:chat");
    expect(emitMock).toHaveBeenCalledWith(
      "chat.message",
      expect.objectContaining({ type: "chat.message" }),
    );
  });

  it("routes chat.deleted to room:roomId:chat channel", () => {
    const { io, toMock } = buildMockIo();
    broadcast(io, "room-abc", {
      type: "chat.deleted",
      messageId: "m1",
    });
    expect(toMock).toHaveBeenCalledWith("room:room-abc:chat");
  });

  it("routes non-chat events to room:roomId (global) channel", () => {
    const { io, toMock } = buildMockIo();
    broadcast(io, "room-abc", {
      type: "presence.updated",
      participants: [],
    });
    expect(toMock).toHaveBeenCalledWith("room:room-abc");
    expect(toMock).not.toHaveBeenCalledWith("room:room-abc:chat");
  });
});

// ---------------------------------------------------------------------------
// syncListenerChatChannelMembership — dynamic channel membership on toggle
// ---------------------------------------------------------------------------

describe("syncListenerChatChannelMembership (Issue #82)", () => {
  function makeMockSocket(accessTier: string) {
    return {
      data: { accessTier },
      join: vi.fn(),
      leave: vi.fn(),
    };
  }

  function buildMockIo(sockets: Array<ReturnType<typeof makeMockSocket>>) {
    return {
      in: vi.fn().mockReturnThis(),
      fetchSockets: vi.fn().mockResolvedValue(sockets),
    } as unknown as Server;
  }

  it("joins listener sockets when listenerChatVisible becomes true", async () => {
    const listener = makeMockSocket("listener");
    const member = makeMockSocket("member");
    const io = buildMockIo([listener, member]);

    await syncListenerChatChannelMembership(io, "room-abc", true);

    expect(listener.join).toHaveBeenCalledWith("room:room-abc:chat");
    expect(listener.leave).not.toHaveBeenCalled();
    expect(member.join).not.toHaveBeenCalled();
    expect(member.leave).not.toHaveBeenCalled();
  });

  it("leaves listener sockets when listenerChatVisible becomes false", async () => {
    const listener = makeMockSocket("listener");
    const member = makeMockSocket("member");
    const io = buildMockIo([listener, member]);

    await syncListenerChatChannelMembership(io, "room-abc", false);

    expect(listener.leave).toHaveBeenCalledWith("room:room-abc:chat");
    expect(listener.join).not.toHaveBeenCalled();
    expect(member.leave).not.toHaveBeenCalled();
    expect(member.join).not.toHaveBeenCalled();
  });

  it("handles multiple listener sockets, only affects listeners", async () => {
    const listener1 = makeMockSocket("listener");
    const listener2 = makeMockSocket("listener");
    const member = makeMockSocket("member");
    const io = buildMockIo([listener1, listener2, member]);

    await syncListenerChatChannelMembership(io, "room-abc", true);

    expect(listener1.join).toHaveBeenCalled();
    expect(listener2.join).toHaveBeenCalled();
    expect(member.join).not.toHaveBeenCalled();
    expect(member.leave).not.toHaveBeenCalled();
  });

  it("handles empty socket list without error", async () => {
    const io = buildMockIo([]);
    await expect(
      syncListenerChatChannelMembership(io, "room-abc", true),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Connection-time chat channel gating (gateway.ts gateway condition)
// ---------------------------------------------------------------------------

describe("Connection-time chat channel gating (Issue #82)", () => {
  function shouldJoinChat(
    accessTier: string,
    listenerChatVisible: boolean,
  ): boolean {
    return accessTier !== "listener" || listenerChatVisible;
  }

  it("member always joins chat channel regardless of listenerChatVisible", () => {
    expect(shouldJoinChat("member", false)).toBe(true);
    expect(shouldJoinChat("member", true)).toBe(true);
  });

  it("host always joins chat channel", () => {
    expect(shouldJoinChat("host", false)).toBe(true);
    expect(shouldJoinChat("host", true)).toBe(true);
  });

  it("moderator always joins chat channel", () => {
    expect(shouldJoinChat("moderator", false)).toBe(true);
    expect(shouldJoinChat("moderator", true)).toBe(true);
  });

  it("listener joins chat channel only when listenerChatVisible is true", () => {
    expect(shouldJoinChat("listener", true)).toBe(true);
    expect(shouldJoinChat("listener", false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full chat.send handler flow with broadcast targeting
// ---------------------------------------------------------------------------

describe("Full chat.send handler flow with broadcast targeting (Issue #82)", () => {
  function buildChatFlowApp(accessTier: string): FastifyInstance {
    const app = Fastify({ logger: false });

    app.register(
      createConfigPlugin({
        databaseUrl: "postgresql://test:test@localhost:5432/test",
        redisUrl: "redis://localhost:6379",
        sessionSecret: "test-secret-for-testing-only-1234567890",
        corsOrigins: ["http://localhost:3000"],
        youtubeApiKey: null,
        port: 3000,
        host: "0.0.0.0",
        nodeEnv: "test",
      }),
    );

    app.decorate("redis", {
      incr: vi.fn().mockResolvedValue(1),
      pexpire: vi.fn().mockResolvedValue(1),
      duplicate: vi.fn().mockReturnValue({
        quit: vi.fn().mockResolvedValue(undefined),
      }),
      ping: vi.fn().mockResolvedValue("PONG"),
    } as never);

    const sessionRole = accessTier === "listener" ? "listener" : "participant";

    app.decorate("prisma", {
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: "room-abc-123",
          chatLocked: false,
        }),
      },
      roomSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session-1",
          roomId: "room-abc-123",
          isMuted: false,
          role: sessionRole,
        }),
      },
      chatMessage: {
        create: vi.fn().mockResolvedValue({
          id: "chat-msg-new-1",
          body: "hello",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          sender: { displayNickname: "TestUser" },
        }),
      },
      $disconnect: vi.fn(),
    } as never);

    return app;
  }

  function buildChatFlowHandlers(app: FastifyInstance, accessTier: string) {
    const emitMock = vi.fn();
    const onAnyCallbacks: Array<
      (eventName: string, event: ClientEvent) => Promise<void>
    > = [];

    const ioEmitMock = vi.fn();
    const ioToMock = vi.fn().mockReturnValue({ emit: ioEmitMock });

    const mockSocket = {
      data: { accessTier },
      onAny: (cb: (eventName: string, event: ClientEvent) => Promise<void>) => {
        onAnyCallbacks.push(cb);
      },
      emit: emitMock,
    } as unknown as Socket;

    const mockIo = { to: ioToMock } as unknown as Server;

    registerRoomHandlers(app, mockIo, mockSocket, "room-abc-123", "session-1");

    return {
      emitEvent: async (event: ClientEvent) => {
        await onAnyCallbacks[0]!(event.type, event);
      },
      emitMock,
      ioEmitMock,
      ioToMock,
    };
  }

  it("chat.send from member broadcasts chat.message to chat channel", async () => {
    const app = buildChatFlowApp("member");
    const { emitEvent, ioToMock, ioEmitMock } = buildChatFlowHandlers(
      app,
      "member",
    );

    await emitEvent({ type: "chat.send", body: "hello" });

    expect(ioToMock).toHaveBeenCalledWith("room:room-abc-123:chat");
    expect(ioEmitMock).toHaveBeenCalledWith(
      "chat.message",
      expect.objectContaining({ type: "chat.message" }),
    );
    await app.close();
  });

  it("chat.send from member does not emit LISTENER_READ_ONLY", async () => {
    const app = buildChatFlowApp("member");
    const { emitEvent, emitMock } = buildChatFlowHandlers(app, "member");

    await emitEvent({ type: "chat.send", body: "hello" });

    const errorCalls = emitMock.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === "error" &&
        (call[1] as { code?: string }).code === "LISTENER_READ_ONLY",
    );
    expect(errorCalls).toHaveLength(0);
    await app.close();
  });

  it("chat.send from listener does not trigger broadcast (tier gate)", async () => {
    const app = buildChatFlowApp("listener");
    const { emitEvent, ioToMock, emitMock } = buildChatFlowHandlers(
      app,
      "listener",
    );

    await emitEvent({ type: "chat.send", body: "hello" });

    expect(ioToMock).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "LISTENER_READ_ONLY" }),
    );
    await app.close();
  });
});
