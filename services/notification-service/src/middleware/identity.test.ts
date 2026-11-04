import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { callerUserId, namesOtherUser, requireAdmin, requireUser } from "./identity";

const app = express();
app.get("/user", requireUser, (req, res) => res.json({ id: callerUserId(req) }));
app.get("/admin", requireAdmin, (_req, res) => res.json({ ok: true }));
app.get("/names", (req, res) => res.json({ other: namesOtherUser(req, req.query.userId) }));

describe("identity middleware", () => {
  it("requireUser: 401 without x-user-id (blank counts as missing), passes the trimmed id otherwise", async () => {
    expect((await request(app).get("/user")).status).toBe(401);
    expect((await request(app).get("/user").set("x-user-id", "   ")).status).toBe(401);
    expect((await request(app).get("/user").set("x-user-id", " u1 ")).body).toEqual({ id: "u1" });
  });

  it("requireAdmin: 401 without identity, 403 for USER or a role without a user, 200 for ADMIN", async () => {
    expect((await request(app).get("/admin")).status).toBe(401);
    expect((await request(app).get("/admin").set("x-user-role", "ADMIN")).status).toBe(401);
    expect((await request(app).get("/admin").set({ "x-user-id": "u1", "x-user-role": "USER" })).status).toBe(403);
    expect((await request(app).get("/admin").set({ "x-user-id": "a1", "x-user-role": "admin" })).status).toBe(403);
    expect((await request(app).get("/admin").set({ "x-user-id": "a1", "x-user-role": "ADMIN" })).status).toBe(200);
  });

  it("namesOtherUser: only a non-empty, different id counts", async () => {
    expect((await request(app).get("/names").set("x-user-id", "u1")).body.other).toBe(false);
    expect((await request(app).get("/names?userId=").set("x-user-id", "u1")).body.other).toBe(false);
    expect((await request(app).get("/names?userId=u1").set("x-user-id", "u1")).body.other).toBe(false);
    expect((await request(app).get("/names?userId=u2").set("x-user-id", "u1")).body.other).toBe(true);
  });
});
