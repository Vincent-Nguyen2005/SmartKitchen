import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireShoppingUser } from "./auth.middleware";
import type { Request } from "express";

const userId = "33333333-3333-4333-8333-333333333333";
const secret = "unit-test-jwt-secret";

afterEach(() => vi.unstubAllEnvs());

function signedToken(subject: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

function responseMock() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe("shopping-list authentication", () => {
  it("rejects requests without a bearer token", () => {
    const req = { header: vi.fn().mockReturnValue(undefined) };
    const res = responseMock();
    const next = vi.fn();

    requireShoppingUser(req as unknown as Request, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("derives the user ID from the verified JWT subject", () => {
    vi.stubEnv("JWT_SECRET", secret);
    const token = signedToken(userId);
    const req = { header: vi.fn((name: string) => name === "authorization" ? `Bearer ${token}` : "99999999-9999-4999-8999-999999999999") } as unknown as Request;
    const res = responseMock();
    const next = vi.fn();

    requireShoppingUser(req, res as never, next);

    expect((req as Request & { authUser?: { userId: string } }).authUser?.userId).toBe(userId);
    expect(next).toHaveBeenCalledOnce();
  });
});
