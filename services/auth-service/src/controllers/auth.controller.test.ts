import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "../services/auth.service";

test("auth login and me return 503 for a database connection outage", async () => {
  const outage = Object.assign(new Error("Database unavailable"), { code: "P1001" });
  const service = {
    login: async () => { throw outage; },
    verifyAccessToken: () => ({ sub: "11111111-1111-1111-1111-111111111111" }),
    getUser: async () => { throw outage; },
  } as unknown as AuthService;
  const controller = new AuthController(service);
  const app = express();
  app.use(express.json());
  app.post("/login", controller.login);
  app.get("/me", controller.me);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${base}/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@example.com", password: "Password123" }),
    });
    assert.equal(login.status, 503);
    assert.deepEqual(await login.json(), { error: "SERVICE_UNAVAILABLE", message: "Auth database is unavailable" });
    const me = await fetch(`${base}/me`, { headers: { Authorization: "Bearer test-token" } });
    assert.equal(me.status, 503);
    assert.deepEqual(await me.json(), { error: "SERVICE_UNAVAILABLE", message: "Auth database is unavailable" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
