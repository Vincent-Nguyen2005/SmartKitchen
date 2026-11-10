import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";

const originalCorsOrigins = process.env.CORS_ORIGINS;

afterEach(() => {
  if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = originalCorsOrigins;
});

describe("gateway", () => {
  it("keeps health endpoints available", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
  });

  it("returns a consistent unknown route error", async () => {
    const response = await request(createApp()).get("/api/no-such-route");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ROUTE_NOT_FOUND");
  });

  it.each(["http://localhost:8081", "http://localhost:8082", "http://127.0.0.1:8083"])(
    "allows Expo preflight from %s with the requested headers",
    async (origin) => {
      process.env.CORS_ORIGINS = "http://allowed.example";
      const response = await request(createApp()).options("/api/auth/login")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Authorization, Content-Type, ngrok-skip-browser-warning, X-Refresh-Token-Mode");
      expect(response.status).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("authorization");
      expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("content-type");
      expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("ngrok-skip-browser-warning");
    },
  );

  it("keeps configured origins and rejects unrelated or malformed origins", async () => {
    process.env.CORS_ORIGINS = "https://allowed.example";
    const app = createApp();
    for (const origin of ["https://allowed.example", "http://localhost:8081"]) {
      const response = await request(app).options("/api/auth/login")
        .set("Origin", origin).set("Access-Control-Request-Method", "POST");
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    }
    for (const origin of ["https://evil.example", "http://localhost:8080", "http://localhost.evil.example:8082"]) {
      const response = await request(app).options("/api/auth/login")
        .set("Origin", origin).set("Access-Control-Request-Method", "POST");
      expect(response.status).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
    const response = await request(app).get("/api/auth/login").set("Origin", "https://evil.example");
    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
