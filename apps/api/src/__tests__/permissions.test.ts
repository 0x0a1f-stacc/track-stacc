import { describe, expect, it } from "vitest";

import { assertModerator } from "../modules/moderation/moderation.service.js";

function expectAppErrorCode(fn: () => unknown, expectedCode: string) {
  try {
    fn();
    expect.unreachable("should have thrown");
  } catch (err) {
    expect((err as { code: string }).code).toBe(expectedCode);
  }
}

describe("permissions", () => {
  it("requires member access tier for moderator actions", () => {
    expect(() =>
      assertModerator({ id: "s1", accessTier: "member", role: "host", roomId: "room-1" }),
    ).not.toThrow();
    expect(() =>
      assertModerator({ id: "s2", accessTier: "member", role: "moderator", roomId: "room-1" }),
    ).not.toThrow();
    expectAppErrorCode(
      () =>
        assertModerator({
          id: "s3",
          accessTier: "member",
          role: "participant",
          roomId: "room-1",
        }),
      "MODERATOR_REQUIRED",
    );
  });

  it("rejects listener-tier sessions regardless of role", () => {
    expectAppErrorCode(
      () => assertModerator({ id: "s4", accessTier: "listener", role: "host", roomId: "room-1" }),
      "LISTENER_READ_ONLY",
    );
    expectAppErrorCode(
      () =>
        assertModerator({
          id: "s5",
          accessTier: "listener",
          role: "moderator",
          roomId: "room-1",
        }),
      "LISTENER_READ_ONLY",
    );
  });

  it("rejects missing session", () => {
    expectAppErrorCode(() => assertModerator(undefined), "AUTH_REQUIRED");
  });
});
