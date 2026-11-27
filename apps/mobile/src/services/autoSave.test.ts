/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createAutoSaver, FieldError, type AutoSaveState } from "./autoSave";

/** Manual clock: timers run only when `tick` is called. */
const fakeTimers = () => {
  let now = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  let id = 0;
  return {
    timers: {
      set: (callback: () => void, ms: number) => { id += 1; pending.set(id, { at: now + ms, callback }); return id; },
      clear: (handle: unknown) => { pending.delete(handle as number); },
    },
    tick: async (ms: number) => {
      now += ms;
      for (const [key, entry] of [...pending]) if (entry.at <= now) { pending.delete(key); entry.callback(); }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
};

test("debounce: typing saves once, 600 ms after the last change, with the latest value", async () => {
  const clock = fakeTimers();
  const sent: string[] = [];
  const saver = createAutoSaver({ initial: "Sữa", save: async (value: string) => { sent.push(value); }, timers: clock.timers });
  saver.change("Sữa t");
  await clock.tick(300);
  saver.change("Sữa tươi");
  await clock.tick(599);
  assert.deepEqual(sent, []);
  await clock.tick(1);
  assert.deepEqual(sent, ["Sữa tươi"]);
  assert.equal(saver.state().status, "saved");
});

test("no request for an unchanged value (typing back to the saved value, or saving twice)", async () => {
  const clock = fakeTimers();
  const sent: string[] = [];
  const saver = createAutoSaver({ initial: "2", save: async (value: string) => { sent.push(value); }, timers: clock.timers });
  saver.change("3");
  saver.change("2");
  await clock.tick(1000);
  assert.deepEqual(sent, []);
  assert.equal(await saver.saveNow("2"), true);
  assert.equal(await saver.flush(), true);
  assert.deepEqual(sent, []);
  await saver.saveNow("3");
  await saver.saveNow("3");
  assert.deepEqual(sent, ["3"]);
});

test("flush on close saves the pending change at once; dropdowns save immediately", async () => {
  const clock = fakeTimers();
  const sent: Array<{ location: string }> = [];
  const saver = createAutoSaver({ initial: { location: "FRIDGE" }, save: async (value) => { sent.push(value); }, timers: clock.timers });
  saver.change({ location: "PANTRY" });
  assert.equal(await saver.flush(), true);
  assert.deepEqual(sent, [{ location: "PANTRY" }]);
  await clock.tick(1000); // the debounce timer was cancelled: no second request
  assert.equal(sent.length, 1);
  assert.equal(await saver.saveNow({ location: "FREEZER" }), true);
  assert.deepEqual(sent.at(-1), { location: "FREEZER" });
});

test("an error keeps the sheet open: flush resolves false with the field and message; the input is kept", async () => {
  const clock = fakeTimers();
  const states: AutoSaveState[] = [];
  let fail = true;
  const sent: string[] = [];
  const saver = createAutoSaver({
    initial: "1",
    save: async (value: string) => { if (fail) throw new FieldError("Số lượng phải là số không âm.", "quantity"); sent.push(value); },
    onState: (state) => states.push(state),
    timers: clock.timers,
  });
  saver.change("-1");
  assert.equal(await saver.flush(), false);
  assert.deepEqual(saver.state(), { status: "error", error: "Số lượng phải là số không âm.", field: "quantity" });
  // Fixing the value and closing again saves it.
  fail = false;
  saver.change("4");
  assert.equal(await saver.flush(), true);
  assert.deepEqual(sent, ["4"]);
  assert.equal(states.at(-1)?.status, "saved");
});

test("a change during a running save is saved right after it (one request at a time)", async () => {
  let release: () => void = () => undefined;
  const sent: string[] = [];
  let active = 0;
  let maxActive = 0;
  const saver = createAutoSaver({
    initial: "a",
    save: async (value: string) => {
      active += 1; maxActive = Math.max(maxActive, active);
      if (value === "b") await new Promise<void>((resolve) => { release = resolve; });
      sent.push(value); active -= 1;
    },
  });
  const first = saver.saveNow("b");
  const second = saver.saveNow("c");
  release();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(sent, ["b", "c"]);
  assert.equal(maxActive, 1);
});
