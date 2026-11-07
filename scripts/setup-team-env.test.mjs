import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("team setup creates unique local keys without printing or overwriting them", () => {
  const directory = mkdtempSync(join(tmpdir(), "smartkitchen-team-env-"));
  try {
    mkdirSync(join(directory, "scripts"));
    copyFileSync(join(root, ".env.example"), join(directory, ".env.example"));
    const script = join(directory, "scripts", "setup-team-env.mjs");
    copyFileSync(join(root, "scripts", "setup-team-env.mjs"), script);

    const first = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const created = readFileSync(join(directory, ".env"), "utf8");
    const keys = ["JWT_SECRET", "INTERNAL_API_KEY", "PURCHASE_SYNC_API_KEY"].map((name) => {
      const value = created.match(new RegExp(`^${name}=([a-f0-9]{64})$`, "m"))?.[1];
      assert.ok(value, `${name} must be a random 64-character hex value`);
      assert.ok(!first.stdout.includes(value), `${name} must not be printed`);
      return value;
    });
    assert.equal(new Set(keys).size, keys.length);

    const second = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(join(directory, ".env"), "utf8"), created);
  } finally {
    if (dirname(realpathSync(directory)) !== realpathSync(tmpdir())) throw new Error("Unsafe test directory");
    rmSync(directory, { recursive: true, force: true });
  }
});
