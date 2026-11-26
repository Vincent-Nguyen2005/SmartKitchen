/// <reference types="node" />
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createCachedList, createServerSearch, filterByName, loadAllPages } from "./localSearch";

const catalog = [{ name: "Cà rốt" }, { name: "Cà chua" }, { name: "Đậu phụ" }, { name: "Rau muống" }];

test("on-device search: case-insensitive, with or without diacritics, order kept", () => {
  assert.deepEqual(filterByName(catalog, "cà rốt").map((item) => item.name), ["Cà rốt"]);
  assert.deepEqual(filterByName(catalog, "ca rot").map((item) => item.name), ["Cà rốt"]);
  assert.deepEqual(filterByName(catalog, "CA").map((item) => item.name), ["Cà rốt", "Cà chua"]);
  assert.deepEqual(filterByName(catalog, "dau").map((item) => item.name), ["Đậu phụ"]);
  assert.deepEqual(filterByName(catalog, "  rau   muong ").map((item) => item.name), ["Rau muống"]);
  assert.equal(filterByName(catalog, "").length, 4);
  assert.equal(filterByName(catalog, "xoài").length, 0);
});

test("loadAllPages: follows totalPages, or total / limit, and stops on an empty page", async () => {
  const rows = Array.from({ length: 139 }, (_, index) => index);
  const pages: number[] = [];
  const result = await loadAllPages(async (page) => { pages.push(page); return { items: rows.slice((page - 1) * 50, page * 50), totalPages: 3 }; });
  assert.equal(result.length, 139);
  assert.deepEqual(pages, [1, 2, 3]);
  const admin = await loadAllPages(async (page) => ({ items: rows.slice((page - 1) * 100, page * 100), total: 139, limit: 100 }));
  assert.equal(admin.length, 139);
});

test("cached list: one load for concurrent callers, reused while fresh, reloaded on force or when old", async () => {
  let loads = 0;
  let clock = 0;
  const list = createCachedList(async () => { loads += 1; return [loads]; }, 1_000, () => clock);
  const [a, b] = await Promise.all([list.get(), list.get()]);
  assert.deepEqual([a, b, loads], [[1], [1], 1]);
  clock = 500;
  assert.deepEqual(await list.get(), [1]);
  assert.deepEqual(await list.get({ force: true }), [2]);
  clock = 2_000;
  assert.deepEqual(await list.get(), [3]);
  assert.deepEqual(list.peek(), [3]);
});

/** Types "cà rốt" one character at a time, `gapMs` apart, then waits; returns the queries sent. */
async function typeCaRot(gapMs: number, search: (text: string) => void): Promise<void> {
  const word = "cà rốt";
  for (let index = 1; index <= word.length; index += 1) {
    search(word.slice(0, index));
    mock.timers.tick(gapMs);
    await Promise.resolve();
  }
  mock.timers.tick(5_000);
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

test("server search: debounce 400 ms, min 2 chars, repeats skipped — typing 'cà rốt' sends 1 request (fast) / 4 (slow)", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const [gap, expected] of [[150, ["cà rốt"]], [450, ["cà", "cà ", "cà r", "cà rố", "cà rốt"].map((text) => text.trim())]] as const) {
      const sent: string[] = [];
      const search = createServerSearch<string>({ run: async (query) => { sent.push(query); return query; }, onResult: () => undefined });
      await typeCaRot(gap, search.input);
      // "cà " normalizes to "cà", an identical consecutive query, so it is skipped.
      assert.deepEqual(sent, [...new Set(expected)], `gap ${gap} ms`);
      search.input("cà rốt");
      mock.timers.tick(1_000);
      assert.equal(sent.filter((query) => query === "cà rốt").length, 1, "same text again: no request");
    }
  } finally {
    mock.timers.reset();
  }
});

test("server search: the previous request is aborted and a late answer never overwrites a newer one", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const resolvers: Array<(value: string) => void> = [];
    const signals: AbortSignal[] = [];
    const shown: Array<string | null> = [];
    const search = createServerSearch<string>({
      run: (query, signal) => { signals.push(signal); return new Promise((resolve) => resolvers.push(() => resolve(query))); },
      onResult: (result) => shown.push(result),
    });
    search.input("cà");
    mock.timers.tick(400);
    search.input("cà rốt");
    mock.timers.tick(400);
    assert.equal(signals[0].aborted, true);
    resolvers[1]("");
    await Promise.resolve(); await Promise.resolve();
    resolvers[0]("");
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(shown, ["cà rốt"]);
    // Shorter than 2 characters: results cleared, nothing sent.
    search.input("c");
    mock.timers.tick(1_000);
    assert.equal(signals.length, 2);
    assert.deepEqual(shown, ["cà rốt", null]);
  } finally {
    mock.timers.reset();
  }
});
