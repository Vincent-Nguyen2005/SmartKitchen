import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { callerUserId, requireUser } from "./require-user";

describe("require-user middleware", () => {
  const app = express();
  app.get("/me", requireUser, (req, res) => res.json({ userId: callerUserId(req) }));

  it("rejects callers without x-user-id with 401", async () => {
    const response = await request(app).get("/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "UNAUTHORIZED", message: "Authentication required" });
  });

  it("accepts any authenticated caller regardless of role", async () => {
    const response = await request(app).get("/me").set("x-user-id", "user-7");
    expect(response.body).toEqual({ userId: "user-7" });
  });
});
