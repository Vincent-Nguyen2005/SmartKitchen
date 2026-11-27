/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createRequestCache, RATE_LIMIT_FALLBACK_MS, RATE_LIMIT_MAX_WAIT_MS, retryDelayMs } from "./requestCache";

test("identical GETs in flight share one request; each caller gets its own copy", async () => {
  let calls = 0;
  let release: (value: { n: number }) => void = () => undefined;
  const cache = createRequestCache<{ n: number }>({ copy: (value) => ({ ...value }) });
  const fetcher = () => { calls += 1; return new Promise<{ n: number }>((resolve) => { release = resolve; }); };
  const first = cache.get("t|/api/notifications/notifications/dismissals", fetcher);
  const second = cache.get("t|/api/notifications/notifications/dismissals", fetcher);
  release({ n: 1 });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { n: 1 });
  assert.notEqual(a, b);
});

test("a just-answered GET is reused for 2 s, then fetched again; writes and failures are never reused", async () => {
  let clock = 0;
  let calls = 0;
  const cache = createRequestCache<{ ok: boolean }>({ now: () => clock, keep: (value) => value.ok });
  const ok = () => { calls += 1; return Promise.resolve({ ok: true }); };
  await cache.get("k", ok);
  clock = 1500;
  await cache.get("k", ok);
  assert.equal(calls, 1);
  clock = 2500;
  await cache.get("k", ok);
  assert.equal(calls, 2);
  // A write clears it.
  cache.clear();
  await cache.get("k", ok);
  assert.equal(calls, 3);
  // A failed answer (not ok) is not kept.
  let failures = 0;
  const bad = () => { failures += 1; return Promise.resolve({ ok: false }); };
  await cache.get("bad", bad);
  await cache.get("bad", bad);
  assert.equal(failures, 2);
  // A rejected request is not kept either.
  let rejected = 0;
  const boom = () => { rejected += 1; return Promise.reject(new Error("down")); };
  await assert.rejects(cache.get("boom", boom));
  await assert.rejects(cache.get("boom", boom));
  assert.equal(rejected, 2);
});

test("429: wait Retry-After (capped) before the one retry, else a short backoff", () => {
  assert.equal(retryDelayMs("2"), 2000);
  assert.equal(retryDelayMs("60"), RATE_LIMIT_MAX_WAIT_MS);
  assert.equal(retryDelayMs(null), RATE_LIMIT_FALLBACK_MS);
  assert.equal(retryDelayMs("abc"), RATE_LIMIT_FALLBACK_MS);
});
