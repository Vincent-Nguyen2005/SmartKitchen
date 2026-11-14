import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireAdmin } from "./require-admin";

const buildApp = () => {
  const app = express();
  app.get("/protected", requireAdmin, (_request, response) => response.json({ ok: true }));
  return app;
};

describe("require-admin middleware", () => {
  it("rejects requests without the ADMIN role", async () => {
    const response = await request(buildApp()).get("/protected").set("x-user-id", "e2e-admin").set("x-user-role", "USER");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });

  it("answers 401 when no token is present", async () => {
    const response = await request(buildApp()).get("/protected");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("answers 401 when the Authorization header is empty", async () => {
    const response = await request(buildApp()).get("/protected").set("authorization", "  ");
    expect(response.status).toBe(401);
  });

  it("answers 403 when a token was sent but the gateway attached no admin identity", async () => {
    const response = await request(buildApp()).get("/protected").set("authorization", "Basic abc");
    expect(response.status).toBe(403);
  });

  it("lets an identified ADMIN through", async () => {
    const response = await request(buildApp()).get("/protected").set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
    expect(response.status).toBe(200);
  });
});
