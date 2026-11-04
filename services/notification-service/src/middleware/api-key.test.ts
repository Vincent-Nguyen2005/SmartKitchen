import * as crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKeyMatches, createApiKeyGuard } from "./api-key";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

describe("apiKeyMatches", () => {
  it("accepts the exact key and rejects others", () => {
    expect(apiKeyMatches("secret-key", "secret-key")).toBe(true);
    expect(apiKeyMatches("secret-kez", "secret-key")).toBe(false);
    expect(apiKeyMatches("secret", "secret-key")).toBe(false);
  });

  it("never matches when the expected key is unset or empty", () => {
    expect(apiKeyMatches("", "")).toBe(false);
    expect(apiKeyMatches(undefined, undefined)).toBe(false);
  });

  it("compares with timingSafeEqual on equal-length digests even for different-length keys", () => {
    const spy = vi.mocked(crypto.timingSafeEqual);
    spy.mockClear();
    apiKeyMatches("x", "a-much-longer-expected-key");
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0] as [Buffer, Buffer];
    expect(a.length).toBe(b.length);
  });
});

describe("createApiKeyGuard", () => {
  afterEach(() => { delete process.env.TEST_KEY; });
  const app = express();
  app.get("/guarded", createApiKeyGuard("TEST_KEY", "Invalid test key"), (_req, res) => res.json({ ok: true }));

  it("reads the expected key from the named env variable at request time", async () => {
    process.env.TEST_KEY = "k1";
    expect((await request(app).get("/guarded").set("x-api-key", "k1")).status).toBe(200);
  });

  it("answers 401 with a JSON error for a wrong or missing key", async () => {
    process.env.TEST_KEY = "k1";
    const wrong = await request(app).get("/guarded").set("x-api-key", "k2");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "UNAUTHORIZED", message: "Invalid test key" });
    expect((await request(app).get("/guarded")).status).toBe(401);
  });

  it("rejects every request when the env key is not configured", async () => {
    expect((await request(app).get("/guarded").set("x-api-key", "")).status).toBe(401);
  });
});
