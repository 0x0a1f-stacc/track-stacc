import Redis from "ioredis";
import fp from "fastify-plugin";

export default fp(async (app) => {
  const redis = new Redis(app.config.redisUrl, { maxRetriesPerRequest: 2 });
  app.decorate("redis", redis);
  app.addHook("onClose", async () => redis.quit());
});
