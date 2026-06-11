import { describe, it, expect } from "vitest";
import {
  parseErrorCode,
  getFieldErrors,
  errorMessageFromCode,
} from "../ProtectNicknameModal";

describe("parseErrorCode", () => {
  it("extracts error code from API JSON error response", () => {
    const error = new Error(
      JSON.stringify({
        error: {
          code: "NICKNAME_TAKEN",
          message: "That nickname is already taken.",
        },
      }),
    );
    expect(parseErrorCode(error)).toBe("NICKNAME_TAKEN");
  });

  it("returns null for non-JSON error messages", () => {
    const error = new Error("Network error");
    expect(parseErrorCode(error)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const error = new Error("{bad json");
    expect(parseErrorCode(error)).toBeNull();
  });

  it("returns null for non-Error caught values", () => {
    expect(parseErrorCode("string error")).toBeNull();
    expect(parseErrorCode(null)).toBeNull();
    expect(parseErrorCode({ code: 123 })).toBeNull();
  });

  it("returns null when error object has no code field", () => {
    const error = new Error(
      JSON.stringify({ error: { message: "something went wrong" } }),
    );
    expect(parseErrorCode(error)).toBeNull();
  });
});

describe("getFieldErrors", () => {
  it("requires a non-empty nickname", () => {
    const result = getFieldErrors(
      "",
      "validPassword123",
      "validPassword123",
      "new",
    );
    expect(result.nickname).toBe("Nickname is required.");
  });

  it("requires a password", () => {
    const result = getFieldErrors("TestUser", "", "", "new");
    expect(result.password).toBe("Password is required.");
  });

  it("enforces minimum password length for new mode", () => {
    const result = getFieldErrors("TestUser", "short", "short", "new");
    expect(result.password).toBe("Password must be at least 10 characters.");
  });

  it("does not enforce minimum password length for auth mode", () => {
    const result = getFieldErrors("TestUser", "short", "", "auth");
    expect(result.password).toBeUndefined();
  });

  it("requires matching confirmation for new mode", () => {
    const result = getFieldErrors(
      "TestUser",
      "longenoughpassword",
      "differentpassword",
      "new",
    );
    expect(result.confirm).toBe("Passwords do not match.");
  });

  it("does not check confirmation for auth mode", () => {
    const result = getFieldErrors("TestUser", "anypassword", "", "auth");
    expect(result.confirm).toBeUndefined();
  });

  it("returns no errors for valid new nickname input", () => {
    const result = getFieldErrors(
      "ValidUser",
      "longenoughpassword",
      "longenoughpassword",
      "new",
    );
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns no errors for valid auth mode input", () => {
    const result = getFieldErrors("ValidUser", "anypassword", "", "auth");
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("validates trimmed nickname", () => {
    const result = getFieldErrors(
      "   ",
      "password12345",
      "password12345",
      "new",
    );
    expect(result.nickname).toBe("Nickname is required.");
  });
});

describe("errorMessageFromCode", () => {
  const cases: Array<[string, string]> = [
    ["NICKNAME_TAKEN", "That nickname is already taken."],
    [
      "NICKNAME_PROTECTED",
      "That nickname is protected. Enter its password to use it.",
    ],
    ["NICKNAME_PASSWORD_INCORRECT", "The password was incorrect."],
    [
      "NICKNAME_PASSWORD_RATE_LIMITED",
      "Too many incorrect attempts. Try again later.",
    ],
    ["VALIDATION_FAILED", "Some fields are missing or invalid."],
    ["SESSION_INVALID", "Your room session expired. Please rejoin."],
    [
      "SERVICE_DEGRADED",
      "Nickname authentication is temporarily unavailable. Try again shortly.",
    ],
    ["UNKNOWN_CODE", "Something went wrong. Try again."],
    ["LISTENER_READ_ONLY", "Something went wrong. Try again."],
  ];

  for (const [code, expectedMessage] of cases) {
    it(`maps ${code} to correct message`, () => {
      expect(errorMessageFromCode(code)).toBe(expectedMessage);
    });
  }
});
