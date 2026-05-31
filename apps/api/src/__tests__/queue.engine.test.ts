import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { selectNextVoting } from "../modules/queue/queue.engine.js";

describe("queue selection algorithms", () => {
  it("selects voting queue by score, age, then recent same-user count", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const prisma = {
      queueItem: {
        findMany: async () => [
          {
            id: "later",
            score: 2,
            createdAt: new Date("2026-01-01T00:01:00Z"),
            addedBySessionId: "a",
          },
          { id: "winner", score: 2, createdAt, addedBySessionId: "b" },
          { id: "low", score: 1, createdAt, addedBySessionId: "c" },
        ],
        groupBy: async () => [{ addedBySessionId: "b", _count: 0 }],
      },
    } as unknown as PrismaClient;

    await expect(selectNextVoting(prisma, "room")).resolves.toMatchObject({
      id: "winner",
    });
  });
});
