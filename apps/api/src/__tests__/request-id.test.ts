import Fastify from "fastify";
import { nanoid } from "nanoid";
import { describe, it, expect } from "vitest";

describe("request ID middleware", () => {
  it("provides request.id from genReqId when no header is present", async () => {
    const app = Fastify({
      genReqId: () => "test-generated-id",
      requestIdHeader: "X-Request-Id",
      requestIdLogLabel: "requestId",
    });
    app.get("/test", async (request) => ({ id: request.id }));
    const response = await app.inject({ method: "GET", url: "/test" });
    const body = JSON.parse(response.body) as { id: string };
    expect(body.id).toBe("test-generated-id");
  });

  it("uses incoming X-Request-Id header as request.id", async () => {
    const app = Fastify({
      genReqId: () => "fallback-id",
      requestIdHeader: "X-Request-Id",
      requestIdLogLabel: "requestId",
    });
    app.get("/test", async (request) => ({ id: request.id }));
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: { "X-Request-Id": "custom-client-id" },
    });
    const body = JSON.parse(response.body) as { id: string };
    expect(body.id).toBe("custom-client-id");
  });

  it("generates request IDs using nanoid(21)", async () => {
    const app = Fastify({
      genReqId: () => nanoid(21),
      requestIdHeader: "X-Request-Id",
      requestIdLogLabel: "requestId",
    });
    app.get("/test", async (request) => ({ id: request.id }));
    const response = await app.inject({ method: "GET", url: "/test" });
    const body = JSON.parse(response.body) as { id: string };
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
    expect(String(body.id).length).toBe(21);
  });

  it("uses arbitrarily long X-Request-Id as-is", async () => {
    const app = Fastify({
      genReqId: () => "fallback",
      requestIdHeader: "X-Request-Id",
      requestIdLogLabel: "requestId",
    });
    const longId = "a".repeat(2000);
    app.get("/test", async (request) => ({ id: request.id }));
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: { "X-Request-Id": longId },
    });
    const body = JSON.parse(response.body) as { id: string };
    expect(body.id).toBe(longId);
  });
});
