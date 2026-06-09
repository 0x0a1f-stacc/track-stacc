import "fastify";
import type { ApiConfig } from "../lib/config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: ApiConfig;
  }
  interface FastifyRequest {
    config: ApiConfig;
  }
}
