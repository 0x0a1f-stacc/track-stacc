import { describe, it, expect } from "vitest";
import { AppError, toWsErrorAcknowledgement } from "../lib/errors.js";

describe("toWsErrorAcknowledgement", () => {
  it("produces correct shape with all fields", () => {
    const err = new AppError("QUEUE_LOCKED", "Locked.", 403);
    const ack = toWsErrorAcknowledgement(err, "queue.add", "ws_req001");
    expect(ack.ok).toBe(false);
    expect(ack.sourceEvent).toBe("queue.add");
    expect(ack.code).toBe("QUEUE_LOCKED");
    expect(ack.message).toBe("Locked.");
    expect(ack.requestId).toBe("ws_req001");
    expect(ack.retryable).toBe(false);
    expect(ack.retryAfterSeconds).toBeNull();
  });

  it("passes through retryable and retryAfterSeconds", () => {
    const err = new AppError("RATE_LIMITED", "Slow down.", 429, undefined, true, 30);
    const ack = toWsErrorAcknowledgement(err, "queue.add", "ws_req002");
    expect(ack.retryable).toBe(true);
    expect(ack.retryAfterSeconds).toBe(30);
  });

  it("includes details when present", () => {
    const err = new AppError("VALIDATION_FAILED", "Invalid.", 400, { field: "name" });
    const ack = toWsErrorAcknowledgement(err, "chat.send", "ws_req003");
    expect(ack.details).toEqual({ field: "name" });
  });

  it("uses INTERNAL_ERROR code when created from non-AppError", () => {
    const ack = toWsErrorAcknowledgement(
      new AppError("INTERNAL_ERROR", "Action failed.", 500, undefined, true),
      "queue.vote",
      "ws_req004",
    );
    expect(ack.code).toBe("INTERNAL_ERROR");
    expect(ack.retryable).toBe(true);
  });
});
