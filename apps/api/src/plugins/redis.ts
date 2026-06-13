import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async (app) => {
  const redis = new Redis(app.config.redisUrl, {
    maxRetriesPerRequest: 2,
    connectTimeout: 500,
    enableOfflineQueue: false,
  });
  redis.on("error", (err) => {
    app.log.warn({ err }, "Redis client error");
  });
  app.decorate("redis", redis);
  app.addHook("onClose", async () => redis.quit());
});
