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
      assertModerator({ accessTier: "member", role: "host" }),
    ).not.toThrow();
    expect(() =>
      assertModerator({ accessTier: "member", role: "moderator" }),
    ).not.toThrow();
    expectAppErrorCode(
      () => assertModerator({ accessTier: "member", role: "participant" }),
      "MODERATOR_REQUIRED",
    );
  });

  it("rejects listener-tier sessions regardless of role", () => {
    expectAppErrorCode(
      () => assertModerator({ accessTier: "listener", role: "host" }),
      "LISTENER_READ_ONLY",
    );
    expectAppErrorCode(
      () => assertModerator({ accessTier: "listener", role: "moderator" }),
      "LISTENER_READ_ONLY",
    );
  });

  it("rejects missing session", () => {
    expectAppErrorCode(() => assertModerator(undefined), "AUTH_REQUIRED");
  });
});
