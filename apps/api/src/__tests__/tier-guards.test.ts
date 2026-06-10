import { describe, it, expect } from "vitest";

import {
  requireMember,
  requireHost,
  requireModerator,
  createListenerReadOnlyError,
} from "../auth/guards.js";
import { requireMemberWs } from "../realtime/guards.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectAppErrorCode(fn: () => unknown, expectedCode: string) {
  try {
    fn();
    expect.unreachable("should have thrown");
  } catch (err) {
    expect((err as { code: string }).code).toBe(expectedCode);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSession(
  overrides?: Partial<{
    accessTier: string;
    role: string;
  }>,
) {
  return {
    id: "session-1",
    roomId: "room-1",
    normalizedNickname: null,
    displayNickname: null,
    nicknameClaimId: null,
    sessionTokenHash: "hash",
    isMuted: false,
    isBanned: false,
    joinedAt: new Date(),
    lastSeenAt: new Date(),
    leftAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    accessTier: overrides?.accessTier ?? "listener",
    role: overrides?.role ?? "listener",
  };
}

// ---------------------------------------------------------------------------
// createListenerReadOnlyError
// ---------------------------------------------------------------------------

describe("createListenerReadOnlyError", () => {
  it("returns an AppError with LISTENER_READ_ONLY code and 403 status", () => {
    const err = createListenerReadOnlyError();
    expect(err.code).toBe("LISTENER_READ_ONLY");
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Join with a protected nickname to do that.");
  });
});

// ---------------------------------------------------------------------------
// requireMember
// ---------------------------------------------------------------------------

describe("requireMember", () => {
  it("passes and returns the session for a member-tier session", () => {
    const session = createSession({
      accessTier: "member",
      role: "participant",
    });
    const result = requireMember(session);
    expect(result).toBe(session);
  });

  it("throws LISTENER_READ_ONLY for a listener-tier session", () => {
    const session = createSession({ accessTier: "listener", role: "listener" });
    expectAppErrorCode(() => requireMember(session), "LISTENER_READ_ONLY");
  });

  it("throws AUTH_REQUIRED for undefined session", () => {
    expectAppErrorCode(() => requireMember(undefined), "AUTH_REQUIRED");
  });

  it("throws LISTENER_READ_ONLY for a host-role session with listener tier", () => {
    const session = createSession({ accessTier: "listener", role: "host" });
    expectAppErrorCode(() => requireMember(session), "LISTENER_READ_ONLY");
  });
});

// ---------------------------------------------------------------------------
// requireHost
// ---------------------------------------------------------------------------

describe("requireHost", () => {
  it("passes for a host-role member session", () => {
    const session = createSession({ accessTier: "member", role: "host" });
    expect(() => requireHost(session)).not.toThrow();
  });

  it("throws LISTENER_READ_ONLY for a host-role listener session", () => {
    const session = createSession({ accessTier: "listener", role: "host" });
    expectAppErrorCode(() => requireHost(session), "LISTENER_READ_ONLY");
  });

  it("throws HOST_REQUIRED for a participant member session", () => {
    const session = createSession({
      accessTier: "member",
      role: "participant",
    });
    expectAppErrorCode(() => requireHost(session), "HOST_REQUIRED");
  });

  it("throws AUTH_REQUIRED for undefined session", () => {
    expectAppErrorCode(() => requireHost(undefined), "AUTH_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// requireModerator
// ---------------------------------------------------------------------------

describe("requireModerator", () => {
  it("passes for a moderator-role member session", () => {
    const session = createSession({ accessTier: "member", role: "moderator" });
    expect(() => requireModerator(session)).not.toThrow();
  });

  it("passes for a host-role member session", () => {
    const session = createSession({ accessTier: "member", role: "host" });
    expect(() => requireModerator(session)).not.toThrow();
  });

  it("throws LISTENER_READ_ONLY for a moderator-role listener session", () => {
    const session = createSession({
      accessTier: "listener",
      role: "moderator",
    });
    expectAppErrorCode(() => requireModerator(session), "LISTENER_READ_ONLY");
  });

  it("throws MODERATOR_REQUIRED for a participant member session", () => {
    const session = createSession({
      accessTier: "member",
      role: "participant",
    });
    expectAppErrorCode(() => requireModerator(session), "MODERATOR_REQUIRED");
  });

  it("throws AUTH_REQUIRED for undefined session", () => {
    expectAppErrorCode(() => requireModerator(undefined), "AUTH_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// requireMemberWs
// ---------------------------------------------------------------------------

describe("requireMemberWs", () => {
  it("passes for a member-tier context", () => {
    expect(() => requireMemberWs({ accessTier: "member" })).not.toThrow();
  });

  it("throws LISTENER_READ_ONLY for a listener-tier context", () => {
    expectAppErrorCode(
      () => requireMemberWs({ accessTier: "listener" }),
      "LISTENER_READ_ONLY",
    );
  });

  it("throws LISTENER_READ_ONLY for missing accessTier", () => {
    expectAppErrorCode(() => requireMemberWs({}), "LISTENER_READ_ONLY");
  });

  it("throws LISTENER_READ_ONLY for null accessTier", () => {
    expectAppErrorCode(
      () => requireMemberWs({ accessTier: null }),
      "LISTENER_READ_ONLY",
    );
  });
});
