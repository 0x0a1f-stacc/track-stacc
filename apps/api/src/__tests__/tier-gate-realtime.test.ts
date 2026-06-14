import { PlaylistMechanic, type ClientEvent } from "@trackstacc/types";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Socket, Server } from "socket.io";
import { describe, it, expect, vi } from "vitest";

import { createConfigPlugin } from "../lib/config.js";
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
