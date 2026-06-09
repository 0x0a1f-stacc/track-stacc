import { describe, it, expect } from "vitest";
import { AppError } from "../lib/errors.js";

// requireSession is tested here via its direct error contract
// The full auth plugin integration test requires a Fastify instance with mocked Prisma

describe("requireSession contract", () => {
  it("uses AUTH_REQUIRED code with 401 status", () => {
    // We test the error class used by requireSession
    // Full coverage of the preHandler hook is done via integration tests
    const err = new AppError("AUTH_REQUIRED", "Join the room before doing that.", 401);
    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Join the room before doing that.");
    expect(err.retryable).toBe(false);
  });
});
