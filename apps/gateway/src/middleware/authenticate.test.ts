import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAuthenticate, isAuthExempt, resolveJwtSecret } from "./authenticate";

const SECRET = "test-secret";
// Same shape as auth-service: jwt.sign({ email, role }, JWT_SECRET, { subject, expiresIn: "15m" })
const sign = (payload: Record<string, unknown>, options: jwt.SignOptions = {}, secret = SECRET) =>
  jwt.sign(payload, secret, { subject: "user-1", expiresIn: "15m", ...options });

const echoApp = (secret: string | null = SECRET) => {
  const app = express();
  app.use(createAuthenticate(secret));
  app.use((req, res) => res.json({
    userId: req.headers["x-user-id"] ?? null,
    role: req.headers["x-user-role"] ?? null,
    authorization: req.headers.authorization ?? null,
  }));
  return app;
};

describe("authenticate middleware", () => {
  it("sets x-user-id and x-user-role from a valid access token", async () => {
    const token = sign({ email: "a@b.c", role: "ADMIN" });
    const response = await request(echoApp()).get("/api/admin/reports").set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: "user-1", role: "ADMIN" });
  });

  it("forwards the Authorization header to upstream unchanged", async () => {
    const token = sign({ role: "USER" });
    const response = await request(echoApp()).get("/api/notifications/notifications").set("authorization", `Bearer ${token}`);
    expect(response.body.authorization).toBe(`Bearer ${token}`);
  });

  it("rejects an expired token with 401 on non-auth routes", async () => {
    const token = sign({ role: "USER" }, { expiresIn: -10 });
    const response = await request(echoApp()).get("/api/admin/reports/mine").set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "UNAUTHORIZED", message: "Access token expired" });
  });

  it("rejects a token signed with another secret with 401", async () => {
    const token = sign({ role: "ADMIN" }, {}, "attacker-secret");
    const response = await request(echoApp()).get("/api/admin/reports").set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "UNAUTHORIZED", message: "Invalid access token" });
  });

  it("rejects algorithms outside the HS256 whitelist, including alg=none", async () => {
    const none = jwt.sign({ role: "ADMIN" }, "", { algorithm: "none", subject: "user-1" });
    const hs512 = sign({ role: "ADMIN" }, { algorithm: "HS512" });
    for (const token of [none, hs512]) {
      const response = await request(echoApp()).get("/api/admin/reports").set("authorization", `Bearer ${token}`);
      expect(response.status).toBe(401);
    }
  });

  it("rejects tokens without a subject and malformed bearer values", async () => {
    const noSub = jwt.sign({ role: "ADMIN" }, SECRET, { expiresIn: "15m" });
    expect((await request(echoApp()).get("/api/x").set("authorization", `Bearer ${noSub}`)).status).toBe(401);
    expect((await request(echoApp()).get("/api/x").set("authorization", "Bearer not.a.jwt")).status).toBe(401);
    expect((await request(echoApp()).get("/api/x").set("authorization", "Bearer   ")).status).toBe(401);
  });

  it("lets an expired token pass through on /api/auth/* so refresh and login keep working", async () => {
    const token = sign({ role: "USER" }, { expiresIn: -10 });
    for (const path of ["/api/auth/refresh", "/api/auth/login", "/api/auth"]) {
      const response = await request(echoApp()).post(path).set("authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId: null, role: null, authorization: `Bearer ${token}` });
    }
  });

  it("strips forged identity headers when there is no token", async () => {
    const response = await request(echoApp()).get("/api/admin/reports").set("x-user-id", "victim").set("x-user-role", "ADMIN");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: null, role: null });
  });

  it("replaces forged identity headers with the verified token identity", async () => {
    const token = sign({ role: "USER" });
    const response = await request(echoApp()).get("/api/admin/reports").set("authorization", `Bearer ${token}`).set("x-user-id", "victim").set("x-user-role", "ADMIN");
    expect(response.body).toMatchObject({ userId: "user-1", role: "USER" });
  });

  it("strips forged headers on exempt routes too", async () => {
    const response = await request(echoApp()).get("/api/auth/me").set("x-user-id", "victim").set("x-user-role", "ADMIN");
    expect(response.body).toMatchObject({ userId: null, role: null });
  });

  it("sets only x-user-id when the role claim is missing or unknown", async () => {
    for (const payload of [{ email: "a@b.c" }, { role: "SUPERUSER" }]) {
      const response = await request(echoApp()).get("/api/x").set("authorization", `Bearer ${sign(payload)}`);
      expect(response.body).toMatchObject({ userId: "user-1", role: null });
    }
  });

  it("treats requests without a Bearer scheme as anonymous", async () => {
    const response = await request(echoApp()).get("/api/x").set("authorization", "Basic dXNlcjpwYXNz");
    expect(response.status).toBe(200);
    expect(response.body.userId).toBeNull();
  });

  it("fails closed when no secret is configured", async () => {
    const response = await request(echoApp(null)).get("/api/x").set("authorization", `Bearer ${sign({ role: "ADMIN" })}`);
    expect(response.status).toBe(401);
  });
});

describe("authenticate helpers", () => {
  it("exempts only health and /api/auth paths", () => {
    expect(isAuthExempt("/health")).toBe(true);
    expect(isAuthExempt("/api/health")).toBe(true);
    expect(isAuthExempt("/api/auth/refresh")).toBe(true);
    expect(isAuthExempt("/api/authx")).toBe(false);
    expect(isAuthExempt("/api/admin/reports")).toBe(false);
  });

  it("uses JWT_SECRET, the auth-service dev fallback outside production, and nothing in production", () => {
    expect(resolveJwtSecret({ JWT_SECRET: "s" })).toBe("s");
    expect(resolveJwtSecret({})).toBe("development-only-secret");
    expect(resolveJwtSecret({ NODE_ENV: "production" })).toBeNull();
  });
});
