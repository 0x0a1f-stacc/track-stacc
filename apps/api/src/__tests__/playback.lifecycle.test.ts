import { PlaybackStatus } from "@trackstacc/types";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import {
  advanceQueue,
  destroyAllTimers,
  emitResync,
  getPlaybackState,
  handleClientBuffering,
  handleClientEnd,
  maybeAutoStart,
  skipTrack,
  startTrack,
} from "../modules/playback/playback.coordinator.js";
import { broadcast } from "../realtime/broadcast.js";

vi.mock("../realtime/broadcast.js", () => ({
  broadcast: vi.fn(),
  roomChannel: vi.fn().mockReturnValue("room:mocked"),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
const ioMock = {} as any as Server;
/* eslint-enable @typescript-eslint/no-explicit-any */

const sampleTrack = {
  id: "track-1",
  provider: "youtube" as const,
  providerVideoId: "dQw4w9WgXcQ",
  title: "Test Song",
  channelTitle: "Test Channel",
  thumbnailUrl: null,
  durationSeconds: 213,
  isEmbeddable: true,
  metadataStatus: "complete" as const,
  metadataFetchedAt: new Date(),
  createdAt: new Date(),
};

const roomId = "room-1";
const queueItemId = "qi-1";
const sessionId = "session-1";

const playingState = {
  roomId,
  queueItemId,
  videoId: "dQw4w9WgXcQ",
  title: "Test Song",
  status: PlaybackStatus.Playing,
  startedAt: new Date().toISOString(),
  serverPositionSeconds: 0,
  updatedAt: new Date().toISOString(),
};

const stoppedState = {
  roomId,
  queueItemId: null,
  videoId: null,
  title: null,
  status: PlaybackStatus.Stopped,
  startedAt: null,
  serverPositionSeconds: 0,
  updatedAt: new Date().toISOString(),
};

function mockApp(overrides?: Record<string, unknown>) {
  const base = {
    prisma: {
      queueItem: {
        update: vi.fn().mockResolvedValue(undefined),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      skipVote: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      room: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      roomSession: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    },
    redis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    },
    log: { error: vi.fn() },
  };
  const ov = overrides as Record<string, Record<string, unknown>> | undefined;
  return {
    ...base,
    ...(overrides ?? {}),
    redis: { ...base.redis, ...(ov?.redis ?? {}) },
    prisma: {
      queueItem: { ...base.prisma.queueItem, ...(ov?.prisma?.queueItem ?? {}) },
      skipVote: { ...base.prisma.skipVote, ...(ov?.prisma?.skipVote ?? {}) },
      room: { ...base.prisma.room, ...(ov?.prisma?.room ?? {}) },
      roomSession: {
        ...base.prisma.roomSession,
        ...(ov?.prisma?.roomSession ?? {}),
      },
    },
  } as unknown as FastifyInstance;
}

describe("playback coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    destroyAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getPlaybackState", () => {
    it("returns stopped state when no Redis key exists", async () => {
      const app = mockApp();
      const state = await getPlaybackState(app, roomId);
      expect(state.status).toBe(PlaybackStatus.Stopped);
      expect(state.queueItemId).toBeNull();
    });

    it("returns cached state from Redis", async () => {
      const app = mockApp({
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await getPlaybackState(app, roomId);
      expect(state.queueItemId).toBe(queueItemId);
      expect(state.status).toBe(PlaybackStatus.Playing);
    });
  });

  describe("startTrack", () => {
    it("transitions queue item to playing and broadcasts", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            update: vi.fn().mockResolvedValue({ track: sampleTrack }),
          },
        },
      });
      const state = await startTrack(app, ioMock, roomId, queueItemId);
      expect(state.status).toBe(PlaybackStatus.Playing);
      expect(state.queueItemId).toBe(queueItemId);
      expect(state.videoId).toBe("dQw4w9WgXcQ");
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(app.redis.set).toHaveBeenCalled();
    });

    it("sets a fallback timer and resync interval", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            update: vi.fn().mockResolvedValue({ track: sampleTrack }),
          },
        },
      });
      const timerCount = vi.getTimerCount();
      await startTrack(app, ioMock, roomId, queueItemId);
      expect(vi.getTimerCount()).toBe(timerCount + 2);
    });
  });

  describe("advanceQueue", () => {
    it("marks current as played and starts next queued item", async () => {
      const nextItem = { id: "qi-2", track: sampleTrack };
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            findFirst: vi.fn().mockResolvedValue(nextItem),
            update: vi
              .fn()
              .mockResolvedValueOnce(undefined)
              .mockResolvedValueOnce({ track: sampleTrack }),
          },
          room: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: roomId, playlistMechanic: "fifo" }),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await advanceQueue(app, ioMock, roomId);
      expect(state.status).toBe(PlaybackStatus.Playing);
      expect(state.queueItemId).toBe("qi-2");
    });

    it("transitions to stopped when queue is empty", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue(undefined),
          },
          room: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: roomId, playlistMechanic: "fifo" }),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await advanceQueue(app, ioMock, roomId);
      expect(state.status).toBe(PlaybackStatus.Stopped);
      expect(state.queueItemId).toBeNull();
    });
  });

  describe("skipTrack", () => {
    it("allows host to skip", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          roomSession: {
            findUnique: vi.fn().mockResolvedValue({ role: "host" }),
          },
          room: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: roomId, playlistMechanic: "fifo" }),
          },
          queueItem: {
            ...mockApp().prisma.queueItem,
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const result = await skipTrack(app, ioMock, roomId, sessionId);
      expect(result.status).toBe(PlaybackStatus.Stopped);
    });

    it("rejects participant skip", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          roomSession: {
            findUnique: vi.fn().mockResolvedValue({ role: "participant" }),
          },
        },
      });
      await expect(skipTrack(app, ioMock, roomId, sessionId)).rejects.toThrow(
        "Only hosts and moderators can skip",
      );
    });
  });

  describe("handleClientEnd", () => {
    it("emits resync when track is not near the end", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            findUnique: vi.fn().mockResolvedValue({
              id: queueItemId,
              track: sampleTrack,
            }),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await handleClientEnd(app, ioMock, roomId, queueItemId);
      expect(state.queueItemId).toBe(queueItemId);
    });

    it("does nothing when queueItemId does not match", async () => {
      const app = mockApp({
        redis: {
          get: vi
            .fn()
            .mockResolvedValue(
              JSON.stringify({ ...playingState, queueItemId: "other-qi" }),
            ),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await handleClientEnd(app, ioMock, roomId, queueItemId);
      expect(state.queueItemId).toBe("other-qi");
    });
  });

  describe("handleClientBuffering", () => {
    it("sets a 30s buffering timeout", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            update: vi
              .fn()
              .mockResolvedValueOnce({ track: sampleTrack })
              .mockResolvedValueOnce(undefined),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      await startTrack(app, ioMock, roomId, queueItemId);
      const timersBefore = vi.getTimerCount();
      await handleClientBuffering(app, ioMock, roomId, queueItemId);
      expect(vi.getTimerCount()).toBe(timersBefore + 1);
    });

    it("no-ops when queueItemId does not match", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            update: vi.fn().mockResolvedValue({ track: sampleTrack }),
          },
        },
        redis: {
          get: vi
            .fn()
            .mockResolvedValue(
              JSON.stringify({ ...playingState, queueItemId: "other-qi" }),
            ),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      await startTrack(app, ioMock, roomId, queueItemId);
      const timersBefore = vi.getTimerCount();
      await handleClientBuffering(app, ioMock, roomId, "unrelated");
      expect(vi.getTimerCount()).toBe(timersBefore);
    });
  });

  describe("maybeAutoStart", () => {
    it("starts playback when room is stopped and a queued item exists", async () => {
      const nextItem = { id: "qi-1", track: sampleTrack };
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            findFirst: vi
              .fn()
              .mockImplementation((args: Record<string, unknown>) => {
                const where = args?.where as { status?: string } | undefined;
                if (where?.status === "playing") return Promise.resolve(null);
                return Promise.resolve(nextItem);
              }),
            update: vi.fn().mockResolvedValue({ track: sampleTrack }),
          },
          room: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: roomId, playlistMechanic: "fifo" }),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(stoppedState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await maybeAutoStart(app, ioMock, roomId);
      expect(state.status).toBe(PlaybackStatus.Playing);
      expect(state.queueItemId).toBe("qi-1");
    });

    it("returns current state without changing when already playing", async () => {
      const app = mockApp({
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      const state = await maybeAutoStart(app, ioMock, roomId);
      expect(state.status).toBe(PlaybackStatus.Playing);
      expect(state.queueItemId).toBe(queueItemId);
    });
  });

  describe("timer lifecycle", () => {
    it("destroyAllTimers clears all room timers", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            update: vi.fn().mockResolvedValue({ track: sampleTrack }),
          },
        },
      });
      await startTrack(app, ioMock, roomId, queueItemId);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      destroyAllTimers();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears timers when advancing to stopped (empty queue)", async () => {
      const app = mockApp({
        prisma: {
          ...mockApp().prisma,
          queueItem: {
            ...mockApp().prisma.queueItem,
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi
              .fn()
              .mockResolvedValueOnce({ track: sampleTrack })
              .mockResolvedValueOnce(undefined),
          },
          room: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ id: roomId, playlistMechanic: "fifo" }),
          },
        },
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify(playingState)),
          set: vi.fn().mockResolvedValue("OK"),
        },
      });
      await startTrack(app, ioMock, roomId, queueItemId);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await advanceQueue(app, ioMock, roomId);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("emitResync", () => {
    it("broadcasts playback.resync when state is playing", () => {
      emitResync(ioMock, roomId, playingState);
      expect(broadcast).toHaveBeenCalledWith(ioMock, roomId, {
        type: "playback.resync",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        state: expect.objectContaining({
          roomId,
          queueItemId,
          status: PlaybackStatus.Playing,
        }),
      });
    });

    it("does not broadcast when state is not playing", () => {
      vi.clearAllMocks();
      emitResync(ioMock, roomId, stoppedState);
      expect(broadcast).not.toHaveBeenCalled();
    });
  });
});
