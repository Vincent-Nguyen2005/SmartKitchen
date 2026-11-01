import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";

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
});
