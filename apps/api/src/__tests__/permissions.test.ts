import { describe, expect, it } from "vitest";
import { assertModerator } from "../modules/moderation/moderation.service.js";

describe("permissions", () => {
  it("allows moderators and hosts only", () => {
    expect(() => assertModerator({ role: "host" })).not.toThrow();
    expect(() => assertModerator({ role: "moderator" })).not.toThrow();
    expect(() => assertModerator({ role: "participant" })).toThrow();
  });
});
