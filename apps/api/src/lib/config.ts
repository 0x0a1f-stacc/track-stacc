import fp from "fastify-plugin";

import { validateEnv } from "./env.js";

export interface ApiConfig {
  databaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  corsOrigins: string[];
  youtubeApiKey: string | null;
  port: number;
  host: string;
  nodeEnv: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  validateEnv(env);

  return {
    databaseUrl: env.DATABASE_URL!,
    redisUrl: env.REDIS_URL!,
    sessionSecret: env.SESSION_SECRET!,
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim()),
    youtubeApiKey: env.YOUTUBE_API_KEY || null,
    port: Number(env.API_PORT ?? 4000),
    host: env.API_HOST ?? "0.0.0.0",
    nodeEnv: env.NODE_ENV ?? "development",
  };
}

export function createConfigPlugin(config: ApiConfig) {
  return fp(async (app) => {
    app.decorate("config", config);
  });
}
