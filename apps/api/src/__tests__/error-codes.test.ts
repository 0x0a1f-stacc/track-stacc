import { describe, it, expect } from "vitest";

import { ERROR_REGISTRY, getErrorDefinition } from "../lib/error-codes.js";

const REGISTERED_CODES = [
  "VALIDATION_FAILED",
  "INVALID_COMMAND_SYNTAX",
  "AUTH_REQUIRED",
  "SESSION_INVALID",
  "WEBSOCKET_TOKEN_INVALID",
  "INTEGRATION_AUTH_INVALID",
  "FORBIDDEN",
  "HOST_REQUIRED",
  "MODERATOR_REQUIRED",
  "MUTED",
  "BANNED",
  "ROOM_NOT_FOUND",
  "QUEUE_ITEM_NOT_FOUND",
  "TRACK_NOT_FOUND",
  "CHAT_MESSAGE_NOT_FOUND",
  "NICKNAME_TAKEN",
  "NICKNAME_PROTECTED",
  "NICKNAME_PASSWORD_INCORRECT",
  "NICKNAME_PASSWORD_RATE_LIMITED",
  "ROOM_PASSWORD_REQUIRED",
  "ROOM_PASSWORD_INCORRECT",
  "QUEUE_LOCKED",
  "CHAT_LOCKED",
  "SONG_REQUEST_COOLDOWN",
  "MAX_PENDING_PER_USER_REACHED",
  "QUEUE_FULL",
  "VIDEO_URL_INVALID",
  "VIDEO_UNAVAILABLE",
  "VIDEO_TOO_LONG",
  "DUPLICATE_VIDEO",
  "YOUTUBE_METADATA_DEGRADED",
  "VOTE_NOT_ALLOWED",
  "MECHANIC_CHANGE_COOLDOWN",
  "RATE_LIMITED",
  "LISTENER_READ_ONLY",
  "NICKNAME_PROTECTION_REQUIRED",
  "DEPENDENCY_UNAVAILABLE",
  "SERVICE_DEGRADED",
  "INTERNAL_ERROR",
];

describe("ERROR_REGISTRY", () => {
  for (const code of REGISTERED_CODES) {
    it(`defines ${code}`, () => {
      const def = ERROR_REGISTRY[code];
      expect(def).toBeDefined();
      expect(def!.code).toBe(code);
      expect(def!.statusCode).toBeGreaterThanOrEqual(400);
      expect(typeof def!.retryable).toBe("boolean");
    });
  }
});

describe("getErrorDefinition", () => {
  it("returns definition for known code", () => {
    const def = getErrorDefinition("VALIDATION_FAILED");
    expect(def.code).toBe("VALIDATION_FAILED");
    expect(def.statusCode).toBe(400);
  });

  it("returns INTERNAL_ERROR for unknown code", () => {
    const def = getErrorDefinition("MADE_UP_CODE");
    expect(def.code).toBe("INTERNAL_ERROR");
    expect(def.statusCode).toBe(500);
  });
});
