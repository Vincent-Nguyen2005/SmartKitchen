import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireAdmin } from "./require-admin";

describe("require-admin middleware", () => {
  it("rejects requests without the ADMIN role", async () => {
    const app = express(); app.get("/protected", requireAdmin, (_request, response) => response.json({ ok: true }));
    const response = await request(app).get("/protected").set("x-user-id", "e2e-admin").set("x-user-role", "USER");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });
});
