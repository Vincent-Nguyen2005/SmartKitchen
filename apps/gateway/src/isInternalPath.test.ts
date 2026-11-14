import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, isInternalPath, MalformedPathError, normalizeRequestPath } from "./app";

const BYPASS_VARIANTS = [
  "//internal/secret",
  "/%2Finternal/secret",
  "/./internal/secret",
  "/foo/../internal/secret",
  "/Internal/secret",
  "/internal\\secret",
];

describe("isInternalPath", () => {
  it.each(BYPASS_VARIANTS)("blocks %s", (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each([
    "/api/notifications/%2e%2e/internal/notifications",
    "/api/notifications/INTERNAL/notifications",
    "/%252Finternal/secret",
    "/api/recipes/x/..%5C..%5Cinternal/secret",
  ])("blocks encoded / per-service variant %s", (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each(["/api/recipes/internal-tips", "/api/inventory/items/a%2Fb", "/api/notifications/notifications", "/health"])(
    "allows %s",
    (path) => {
      expect(isInternalPath(path)).toBe(false);
    },
  );

  it("fails closed on malformed encoding", () => {
    expect(isInternalPath("/internal%zz")).toBe(true);
  });
});

describe("normalizeRequestPath", () => {
  it("decodes, converts backslashes, resolves dot segments, collapses slashes and lowercases", () => {
    expect(normalizeRequestPath("/API//Foo/./bar/..\\%62AZ")).toBe("/api/foo/baz");
  });

  it("throws MalformedPathError on invalid percent-encoding", () => {
    expect(() => normalizeRequestPath("/api/%zz")).toThrow(MalformedPathError);
  });
});

describe("gateway internal-path middleware (raw request paths)", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const listening = createApp({ jwtSecret: "gateway-test-secret" }).listen(0, "127.0.0.1", () => resolve(listening));
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // node:http sends the path byte-for-byte, unlike clients that normalize URLs first.
  const rawGet = (path: string): Promise<number> =>
    new Promise((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });

  it.each(BYPASS_VARIANTS)("answers 404 for %s without a token", async (path) => {
    expect(await rawGet(path)).toBe(404);
  });

  it("answers 400 on malformed percent-encoding", async () => {
    expect(await rawGet("/api/%zz/internal")).toBe(400);
  });
});
