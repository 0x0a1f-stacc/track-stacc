import Redis from "ioredis";
import fp from "fastify-plugin";

export default fp(async (app) => {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
  });
  app.decorate("redis", redis);
  app.addHook("onClose", async () => redis.quit());
});
