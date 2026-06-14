import { describe, it, expect } from "vitest";

import { AppError, toErrorResponse, toWsErrorAcknowledgement } from "../lib/errors.js";

describe("AppError", () => {
  it("creates with defaults for optional fields", () => {
    const err = new AppError("TEST_CODE", "Test message.");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Test message.");
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
    expect(err.retryAfterSeconds).toBeNull();
    expect(err.details).toBeUndefined();
  });

  it("accepts all constructor arguments", () => {
    const err = new AppError("RATE_LIMITED", "Slow down.", 429, { limit: 5 }, true, 30);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.details).toEqual({ limit: 5 });
  });
});

describe("toErrorResponse", () => {
  it("includes all envelope fields", () => {
    const err = new AppError("AUTH_REQUIRED", "Auth needed.", 401);
    const response = toErrorResponse(err, "req-001");
    expect(response.error.code).toBe("AUTH_REQUIRED");
    expect(response.error.message).toBe("Auth needed.");
    expect(response.error.requestId).toBe("req-001");
    expect(response.error.retryable).toBe(false);
    expect(response.error.retryAfterSeconds).toBeNull();
  });

  it("passes through retryable and retryAfterSeconds", () => {
    const err = new AppError("RATE_LIMITED", "Slow down.", 429, undefined, true, 30);
    const response = toErrorResponse(err, "req-002");
    expect(response.error.retryable).toBe(true);
    expect(response.error.retryAfterSeconds).toBe(30);
  });

  it("includes details when present", () => {
    const err = new AppError("VALIDATION_FAILED", "Invalid.", 400, { field: "name" });
    const response = toErrorResponse(err, "req-003");
    expect(response.error.details).toEqual({ field: "name" });
  });
});

describe("toWsErrorAcknowledgement", () => {
  it("produces correct shape", () => {
    const err = new AppError("QUEUE_LOCKED", "Locked.", 403);
    const ack = toWsErrorAcknowledgement(err, "queue.add", "req-004");
    expect(ack.ok).toBe(false);
    expect(ack.sourceEvent).toBe("queue.add");
    expect(ack.code).toBe("QUEUE_LOCKED");
    expect(ack.message).toBe("Locked.");
    expect(ack.requestId).toBe("req-004");
    expect(ack.retryable).toBe(false);
    expect(ack.retryAfterSeconds).toBeNull();
  });
});
