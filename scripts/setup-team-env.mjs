import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, ".env");
const required = ["JWT_SECRET", "INTERNAL_API_KEY", "PURCHASE_SYNC_API_KEY"];

if (!existsSync(destination)) {
  let contents = readFileSync(join(root, ".env.example"), "utf8");
  for (const key of required) {
    const assignment = new RegExp(`^${key}=.*$`, "m");
    if (!assignment.test(contents)) throw new Error(`Missing ${key} in .env.example`);
    contents = contents.replace(assignment, `${key}=${randomBytes(32).toString("hex")}`);
  }
  try {
    writeFileSync(destination, contents, { flag: "wx", mode: 0o600 });
    console.log("Created a local .env with unique keys; it remains Git-ignored.");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

const environment = readFileSync(destination, "utf8");
for (const key of required) {
  const value = environment.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  if (!value || value.length < 32 || value.includes("replace-with-")) {
    throw new Error(`Set a unique ${key} (at least 32 characters) in the local .env, then retry.`);
  }
}
console.log("Local team-test environment is ready. OTP messages will appear in Mailpit, not real inboxes.");
