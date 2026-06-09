import { describe, it, expect } from "vitest";
import {
  signWsToken,
  verifyWsToken,
  setSecret,
} from "../lib/tokens.js";

setSecret("test-secret-that-is-at-least-thirty-two-characters!");

describe("signWsToken / verifyWsToken", () => {
  it("round-trips without accessTier (backward compat)", () => {
    const token = signWsToken({ roomId: "r1", sessionId: "s1" });
    const payload = verifyWsToken(token);
    expect(payload.roomId).toBe("r1");
    expect(payload.sessionId).toBe("s1");
    expect(payload.accessTier).toBeUndefined();
    expect(payload.exp).toBeGreaterThan(0);
  });

  it("includes accessTier when provided", () => {
    const token = signWsToken({
      roomId: "r1",
      sessionId: "s1",
      accessTier: "member",
    });
    const payload = verifyWsToken(token);
    expect(payload.accessTier).toBe("member");
  });

  it("rejects malformed token with WEBSOCKET_TOKEN_INVALID", () => {
    try {
      verifyWsToken("not-a-valid-token");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("Invalid websocket token.");
    }
  });

  it("rejects tampered token with WEBSOCKET_TOKEN_INVALID", () => {
    const token = signWsToken({ roomId: "r1", sessionId: "s1" });
    const dotIndex = token.indexOf(".");
    const tampered = `${token.slice(0, dotIndex)}.tampered`;
    try {
      verifyWsToken(tampered);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("Invalid websocket token.");
    }
  });
});

describe("setSecret", () => {
  it("allows secret to be changed at runtime", () => {
    setSecret("new-secret-that-is-long-enough-thirty-two!+");
    const token = signWsToken({ roomId: "r1", sessionId: "s1" });
    const payload = verifyWsToken(token);
    expect(payload.roomId).toBe("r1");

    setSecret("another-secret-that-is-long-enough-thirty-two");
    try {
      verifyWsToken(token);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("Invalid websocket token.");
    }

    setSecret("test-secret-that-is-at-least-thirty-two-characters!");
  });
});
