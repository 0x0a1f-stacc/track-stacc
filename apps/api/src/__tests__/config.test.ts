import { describe, it, expect } from "vitest";

import { loadConfig } from "../lib/config.js";

const MINIMAL_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://localhost:5432/testdb",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "test_secret_at_least_32_chars_long_123456",
};

describe("loadConfig", () => {
  it("returns typed config with all required vars", () => {
    const config = loadConfig(MINIMAL_ENV);
    expect(config.databaseUrl).toBe("postgresql://localhost:5432/testdb");
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.sessionSecret).toBe(
      "test_secret_at_least_32_chars_long_123456",
    );
  });

  it("applies defaults for optional vars", () => {
    const config = loadConfig(MINIMAL_ENV);
    expect(config.port).toBe(4000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.corsOrigins).toEqual(["http://localhost:3000"]);
    expect(config.youtubeApiKey).toBeNull();
    expect(config.nodeEnv).toBe("development");
  });

  it("parses CORS_ORIGINS as comma-separated array", () => {
    const env = {
      ...MINIMAL_ENV,
      CORS_ORIGINS:
        "https://app.example.com,https://admin.example.com",
    };
    const config = loadConfig(env);
    expect(config.corsOrigins).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("throws on missing DATABASE_URL", () => {
    const env = { ...MINIMAL_ENV, DATABASE_URL: undefined };
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it("throws on missing REDIS_URL", () => {
    const env = { ...MINIMAL_ENV, REDIS_URL: undefined };
    expect(() => loadConfig(env)).toThrow(/REDIS_URL/);
  });

  it("throws on missing SESSION_SECRET", () => {
    const env = { ...MINIMAL_ENV, SESSION_SECRET: undefined };
    expect(() => loadConfig(env)).toThrow(/SESSION_SECRET/);
  });

  it("reports all missing vars in a single error", () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL.*REDIS_URL.*SESSION_SECRET/s,
    );
  });

  it("parses API_PORT as number", () => {
    const env = { ...MINIMAL_ENV, API_PORT: "8080" };
    const config = loadConfig(env);
    expect(config.port).toBe(8080);
  });

  it("handles empty YOUTUBE_API_KEY as null", () => {
    const env = { ...MINIMAL_ENV, YOUTUBE_API_KEY: "" };
    const config = loadConfig(env);
    expect(config.youtubeApiKey).toBeNull();
  });
});
