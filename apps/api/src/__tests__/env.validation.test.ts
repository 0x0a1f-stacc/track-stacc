import { describe, it, expect } from "vitest";
import { validateEnv } from "../lib/env.js";

const VALID_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://trackstacc:trackstacc@localhost:5432/trackstacc",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "test_secret_that_is_definitely_at_least_32_characters",
};

describe("validateEnv", () => {
  it("does not throw when all required vars are set", () => {
    expect(() => validateEnv(VALID_ENV)).not.toThrow();
  });

  it("throws when DATABASE_URL is missing", () => {
    const env = { ...VALID_ENV, DATABASE_URL: undefined };
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it("throws when REDIS_URL is missing", () => {
    const env = { ...VALID_ENV, REDIS_URL: undefined };
    expect(() => validateEnv(env)).toThrow(/REDIS_URL/);
  });

  it("throws when SESSION_SECRET is missing", () => {
    const env = { ...VALID_ENV, SESSION_SECRET: undefined };
    expect(() => validateEnv(env)).toThrow(/SESSION_SECRET/);
  });

  it("reports all missing variables in a single error", () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL.*REDIS_URL.*SESSION_SECRET/s,
    );
  });

  it("includes .env.example hint in error message", () => {
    expect(() => validateEnv({})).toThrow(/.env.example/);
  });

  it("treats empty string as missing", () => {
    const env = { ...VALID_ENV, DATABASE_URL: "" };
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });
});
