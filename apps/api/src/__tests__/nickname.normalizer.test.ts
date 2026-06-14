import { describe, expect, it } from "vitest";

import { normalizeNickname } from "../modules/identity/nickname.normalizer.js";

describe("normalizeNickname", () => {
  it("trims, folds, and normalizes nicknames", () => {
    expect(normalizeNickname("  DJ  Fredo  ")).toEqual({
      displayNickname: "DJ Fredo",
      normalizedNickname: "dj fredo",
    });
  });
  it("rejects reserved names and controls", () => {
    expect(() => normalizeNickname("admin")).toThrow();
    expect(() => normalizeNickname("bad\u0000name")).toThrow();
  });
});
