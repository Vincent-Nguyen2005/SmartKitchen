import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { AuthController } from "./auth.controller";
import { AuthService, AuthServiceError } from "../services/auth.service";

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

test("login exposes stable codes for wrong credentials and unverified accounts", async () => {
  const service = {
    login: async (email: string) => { throw new Error(email.startsWith("pending") ? "EMAIL_NOT_VERIFIED" : "INVALID_CREDENTIALS"); },
  } as unknown as AuthService;
  const app = express();
  app.use(express.json());
  app.post("/login", new AuthController(service).login);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    for (const [email, status, code] of [
      ["wrong@example.com", 401, "INVALID_CREDENTIALS"],
      ["pending@example.com", 403, "EMAIL_NOT_VERIFIED"],
    ] as const) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "Password123" }),
      });
      assert.equal(response.status, status);
      assert.equal((await response.json() as { code: string }).code, code);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("password reset request is generic and confirmation validates code", async () => {
  let requested = "";
  const service = {
    requestPasswordReset: async (email: string) => { requested = email; },
    confirmPasswordReset: async () => { throw new AuthServiceError("Invalid or expired password reset code", "INVALID_RESET_CODE"); },
  } as unknown as AuthService;
  const controller = new AuthController(service);
  const app = express();
  app.use(express.json());
  app.post("/request", controller.requestPasswordReset);
  app.post("/confirm", controller.confirmPasswordReset);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const request = await fetch(`${base}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "MEMBER@example.com" }) });
    assert.equal(request.status, 202);
    assert.equal(requested, "MEMBER@example.com");
    const invalid = await fetch(`${base}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@example.com", code: "12345678", newPassword: "NewPassword123" }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { code: string }).code, "INVALID_RESET_CODE");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
