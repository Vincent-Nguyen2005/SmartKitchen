/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createAuthCoordinator, jwtExpiresAt, RefreshRejectedError, refreshDelayMs, sendWithRefresh } from "./authSession";

const jwtWith = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
const response = (status: number) => ({ status }) as Response;

test("concurrent 401s share one refresh, then each request retries once with the new token", async () => {
  const coordinator = createAuthCoordinator();
  coordinator.setToken("old");
  let refreshes = 0;
  coordinator.configure({ refresh: async () => { refreshes += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return "new"; }, onExpired: () => undefined });
  const sent: string[] = [];
  const send = async (token: string | undefined) => { sent.push(token ?? ""); return response(token === "new" ? 200 : 401); };
  const results = await Promise.all([1, 2, 3].map(() => sendWithRefresh(coordinator, send, "old")));
  assert.deepEqual(results.map((result) => result.status), [200, 200, 200]);
  assert.equal(refreshes, 1);
  assert.deepEqual(sent.sort(), ["new", "new", "new", "old", "old", "old"]);
  // A screen still holding the old token sends the newest one; no further refresh.
  await sendWithRefresh(coordinator, send, "old");
  assert.equal(sent.at(-1), "new");
  assert.equal(refreshes, 1);
});

test("a 401 that arrives after another request already refreshed reuses the new token", async () => {
  const coordinator = createAuthCoordinator();
  coordinator.setToken("new");
  let refreshes = 0;
  coordinator.configure({ refresh: async () => { refreshes += 1; return "newer"; }, onExpired: () => undefined });
  assert.equal(await coordinator.refresh("old"), "new");
  assert.equal(refreshes, 0);
});

test("retry only once: a second 401 is returned as is", async () => {
  const coordinator = createAuthCoordinator();
  coordinator.setToken("a");
  coordinator.configure({ refresh: async () => "b", onExpired: () => undefined });
  let calls = 0;
  const result = await sendWithRefresh(coordinator, async () => { calls += 1; return response(401); }, "a");
  assert.equal(result.status, 401);
  assert.equal(calls, 2);
});

test("a rejected refresh ends the session once and returns the 401; a network failure does not end it", async () => {
  const coordinator = createAuthCoordinator();
  coordinator.setToken("a");
  let expired = 0;
  coordinator.configure({ refresh: async () => { throw new RefreshRejectedError(); }, onExpired: () => { expired += 1; } });
  const results = await Promise.all([1, 2].map(() => sendWithRefresh(coordinator, async () => response(401), "a")));
  assert.deepEqual(results.map((result) => result.status), [401, 401]);
  assert.equal(expired, 1);
  assert.equal(coordinator.current(), null);

  const offline = createAuthCoordinator();
  offline.setToken("a");
  let offlineExpired = 0;
  offline.configure({ refresh: async () => { throw new TypeError("Network request failed"); }, onExpired: () => { offlineExpired += 1; } });
  await assert.rejects(sendWithRefresh(offline, async () => response(401), "a"), TypeError);
  assert.equal(offlineExpired, 0);
  assert.equal(offline.current(), "a");
});

test("requests without a token never refresh", async () => {
  const coordinator = createAuthCoordinator();
  let refreshes = 0;
  coordinator.configure({ refresh: async () => { refreshes += 1; return "x"; }, onExpired: () => undefined });
  const result = await sendWithRefresh(coordinator, async (token) => response(token ? 200 : 401), null);
  assert.equal(result.status, 401);
  assert.equal(refreshes, 0);
});

test("proactive refresh: one minute before expiry, now when expired, null when unreadable", () => {
  const now = 1_700_000_000_000;
  const token = jwtWith({ sub: "u", exp: now / 1000 + 15 * 60 });
  assert.equal(jwtExpiresAt(token), now + 15 * 60_000);
  assert.equal(refreshDelayMs(token, now), 14 * 60_000);
  assert.equal(refreshDelayMs(jwtWith({ exp: now / 1000 - 5 }), now), 0);
  assert.equal(refreshDelayMs("not-a-jwt", now), null);
  assert.equal(refreshDelayMs(jwtWith({ sub: "u" }), now), null);
});
