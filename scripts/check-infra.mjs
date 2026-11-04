#!/usr/bin/env node
// Deterministic infra consistency checks (no Docker, no network, no dependencies).
// Run: pnpm check:infra   (also runs in CI as job "CI / infra-check")
// Severity follows ownership (see OWNERSHIP below):
// FAIL = an inconsistency that a change by the infra owner (gateway, notification, admin, CI, root config)
//        could cause; exits 1.
// WARN = a gap caused by / located in another owner's workspace or service block; reported, never fails.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// OWNERSHIP: workspaces and paths maintained by the infra owner (Huy). Everything else is another owner's.
const INFRA_OWNED = new Set(["gateway", "notification-service", "admin-service"]);
const INFRA_PATHS = ["apps/gateway/", "services/notification-service/", "services/admin-service/", "scripts/", "docs/", "deploy/", ".github/", "apps/mobile/src/screens/notifications/", "apps/mobile/src/screens/admin/"];
const INFRA_ROOT_FILES = new Set(["package.json", "turbo.json", "docker-compose.yml", ".env.example", "README.md", "pnpm-workspace.yaml"]);
const isInfraPath = (path) => INFRA_ROOT_FILES.has(path) || INFRA_PATHS.some((prefix) => path.startsWith(prefix));

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const results = { pass: 0, fail: 0, warn: 0 };
const pass = (message) => { results.pass++; console.log(`PASS ${message}`); };
const fail = (message) => { results.fail++; console.log(`FAIL ${message}`); };
const warn = (message) => { results.warn++; console.log(`WARN ${message}`); };
const check = (ok, message, level = fail) => (ok ? pass(message) : level(message));

// ---------- parse inputs ----------
const routes = [...read("apps/gateway/src/config/routes.ts").matchAll(/prefix: "([^"]+)", serviceName: "([^"]+)", envKey: "([^"]+)", defaultTarget: "http:\/\/localhost:(\d+)"/g)]
  .map(([, prefix, serviceName, envKey, port]) => ({ prefix, serviceName, envKey, port: Number(port) }));

/** Minimal docker-compose reader: top-level services, their host:container port and environment keys. */
const parseCompose = (text) => {
  const services = {};
  let current = null;
  let inEnvBlock = false;
  for (const line of text.split("\n")) {
    const service = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (service) { current = services[service[1]] = { ports: [], env: {} }; inEnvBlock = false; continue; }
    if (/^\S/.test(line)) { current = null; continue; }
    if (!current) continue;
    const ports = line.match(/^ {4}ports:\s*\["(\d+):(\d+)"\]/);
    if (ports) current.ports.push({ host: Number(ports[1]), container: Number(ports[2]) });
    const inline = line.match(/^ {4}environment:\s*\{(.*)\}\s*$/);
    if (inline) { for (const pair of inline[1].split(/,\s*(?=[A-Z_]+:)/)) { const [key, ...rest] = pair.split(":"); current.env[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, ""); } inEnvBlock = false; continue; }
    if (/^ {4}environment:\s*$/.test(line)) { inEnvBlock = true; continue; }
    if (/^ {4}\S/.test(line)) inEnvBlock = false;
    const envLine = inEnvBlock && line.match(/^ {6}([A-Z0-9_]+):\s*(.*)$/);
    if (envLine) current.env[envLine[1]] = envLine[2].trim().replace(/^"|"$/g, "");
  }
  return services;
};
const compose = parseCompose(read("docker-compose.yml"));

const ciMatrix = [...read(".github/workflows/ci.yml").matchAll(/- package: ([a-z0-9-]+)\n\s+prisma_schema: '?([^'\n#]*)'?/g)]
  .map(([, pkg, schema]) => ({ pkg, schema: schema.trim() }));

const workspaces = ["apps", "services"].flatMap((dir) => readdirSync(join(root, dir))
  .filter((name) => existsSync(join(root, dir, name, "package.json")))
  .map((name) => ({ dir: `${dir}/${name}`, pkg: JSON.parse(read(`${dir}/${name}/package.json`)) })));

// ---------- 1. gateway route table vs docker-compose ----------
console.log("\n# Gateway route table vs docker-compose.yml");
check(routes.length === 11, `gateway has 11 routes (found ${routes.length})`);
for (const route of routes) {
  const service = compose[route.serviceName];
  const serviceLevel = INFRA_OWNED.has(route.serviceName) ? fail : warn; // other owners' compose blocks only warn
  check(Boolean(service), `${route.prefix} -> compose service "${route.serviceName}" exists`, serviceLevel);
  if (!service) continue;
  check(service.ports.some((port) => port.host === route.port && port.container === route.port), `${route.serviceName} publishes ${route.port}:${route.port} (gateway default target)`, serviceLevel);
  const expected = `http://${route.serviceName}:${route.port}`;
  check(compose.gateway?.env[route.envKey] === expected, `gateway env ${route.envKey}=${expected}`);
  check(compose["admin-service"]?.env[route.envKey] === expected, `admin health monitor env ${route.envKey}=${expected}`);
}
check(compose["admin-service"]?.env.GATEWAY_URL === "http://gateway:4000", "admin health monitor env GATEWAY_URL=http://gateway:4000");

// ---------- 2. .env.example completeness (infra-owned workspaces) ----------
console.log("\n# .env.example lists every variable the code reads");
const IGNORED_ENV = new Set(["NODE_ENV"]);
const sourceFiles = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
});
for (const dir of ["apps/gateway", "services/notification-service", "services/admin-service"]) {
  const used = new Set();
  for (const file of sourceFiles(`${dir}/src`)) {
    const text = read(file);
    for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[\s*"([A-Z0-9_]+)"\s*\]|createApiKeyGuard\("([A-Z0-9_]+)"/g)) used.add(match[1] || match[2] || match[3]);
    for (const match of text.matchAll(/envKey: "([A-Z0-9_]+)"/g)) used.add(match[1]);
    for (const match of text.matchAll(/env\.([A-Z0-9_]+)/g)) used.add(match[1]);
  }
  const documented = new Set([...read(`${dir}/.env.example`).matchAll(/^#?\s*([A-Z0-9_]+)=/gm)].map((match) => match[1]));
  const missing = [...used].filter((key) => !IGNORED_ENV.has(key) && !documented.has(key)).sort();
  check(missing.length === 0, `${dir}/.env.example documents all ${used.size} env vars${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
}
const requiredByCompose = [...new Set([...read("docker-compose.yml").matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((match) => match[1]))];
const rootExample = existsSync(join(root, ".env.example")) ? read(".env.example") : "";
for (const key of requiredByCompose) check(new RegExp(`^${key}=`, "m").test(rootExample), `root .env.example lists compose-required ${key}`, warn); // new :? vars come from service owners

// ---------- 3. CI matrix covers every workspace; prisma rules ----------
console.log("\n# CI matrix and Prisma rules");
const NOT_IN_MATRIX = new Set(["mobile"]); // Expo app: type-checked separately, not part of lint-build
const matrixPkgs = new Set(ciMatrix.map((entry) => entry.pkg));
for (const workspace of workspaces) {
  if (NOT_IN_MATRIX.has(workspace.pkg.name)) continue;
  check(matrixPkgs.has(workspace.pkg.name), `ci.yml matrix includes ${workspace.pkg.name}`, INFRA_OWNED.has(workspace.pkg.name) ? fail : warn);
}
check(ciMatrix.length === workspaces.length - NOT_IN_MATRIX.size, `ci.yml matrix has ${ciMatrix.length} entries for ${workspaces.length - NOT_IN_MATRIX.size} workspaces`, warn);
for (const workspace of workspaces) {
  const name = workspace.pkg.name;
  const schemaPath = `${workspace.dir}/prisma/schema.prisma`;
  if (!existsSync(join(root, schemaPath))) continue;
  const schema = read(schemaPath);
  const hasModels = /^model\s+\w+/m.test(schema);
  const entry = ciMatrix.find((item) => item.pkg === name);
  const level = INFRA_OWNED.has(name) ? fail : warn;
  if (entry?.schema) {
    check(entry.schema === schemaPath, `${name}: prisma_schema points to ${schemaPath}`, level);
    check(Boolean(workspace.pkg.scripts?.["prisma:generate"]), `${name}: has a prisma:generate script (CI calls it)`, level);
  } else if (hasModels) {
    check(false, `${name}: schema has models but ci.yml prisma_schema is empty`, level);
  }
  if (hasModels) {
    const output = schema.match(/output\s*=\s*"([^"]+)"/)?.[1] ?? "";
    check(/\.prisma\/client-[a-z0-9-]+$/.test(output), `${name}: dedicated Prisma client output (found "${output || "default"}")`, level);
    check(!/prisma generate/.test(workspace.pkg.scripts?.build ?? ""), `${name}: build script does not run prisma generate`, level);
    const prismaCli = workspace.pkg.dependencies?.prisma ?? workspace.pkg.devDependencies?.prisma;
    check(workspace.pkg.dependencies?.["@prisma/client"] === "5.22.0" && prismaCli === "5.22.0", `${name}: prisma and @prisma/client pinned to 5.22.0`, level);
  }
}

// ---------- 4. production Dockerfiles ----------
console.log("\n# Production Dockerfiles");
for (const workspace of workspaces) {
  const dockerfile = `${workspace.dir}/Dockerfile`;
  if (!existsSync(join(root, dockerfile))) continue;
  const name = workspace.pkg.name;
  const level = INFRA_OWNED.has(name) ? fail : warn;
  const text = read(dockerfile);
  const stages = text.split(/^FROM\s+/m).slice(1);
  const runtime = stages[stages.length - 1] ?? "";
  check(stages.length >= 2 && stages.every((stage) => stage.startsWith("node:20-alpine")), `${name}: multi-stage node:20-alpine`, level);
  check(/^USER\s+node\s*$/m.test(runtime), `${name}: runtime runs as non-root USER node`, level);
  check(/^ENV\s+NODE_ENV=production\s*$/m.test(runtime), `${name}: runtime sets NODE_ENV=production`, level);
  check(!/(^|\n)(?!#).*prisma\s+(migrate\s+dev|db\s+push)/.test(text), `${name}: never runs prisma migrate dev / db push`, level);
  const schemaPath = `${workspace.dir}/prisma/schema.prisma`;
  if (existsSync(join(root, schemaPath)) && /^model\s+\w+/m.test(read(schemaPath))) {
    check(/apk add --no-cache openssl/.test(runtime), `${name}: openssl installed in the runtime stage (Prisma engines)`, level);
    if (INFRA_OWNED.has(name)) {
      check(/prisma\s+migrate\s+deploy/.test(runtime) && /COPY .*\/app\/prisma \.\/prisma/.test(runtime), `${name}: runs prisma migrate deploy on start with prisma/ copied`, level);
      check(/COPY .*\/app\/node_modules \.\/node_modules|client-[a-z-]+/.test(runtime), `${name}: dedicated Prisma client copied into the runtime stage`, level);
    }
  }
}

// ---------- 5. deploy blueprint: only the gateway is public ----------
console.log("\n# deploy/render.yaml");
if (existsSync(join(root, "deploy/render.yaml"))) {
  const blueprint = read("deploy/render.yaml").split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  const typed = [...blueprint.matchAll(/- type: (\w+)\n\s+name: ([\w-]+)/g)].map(([, type, name]) => ({ type, name }));
  const publicServices = typed.filter((service) => service.type === "web").map((service) => service.name);
  check(publicServices.length === 1 && publicServices[0] === "smartkitchen-gateway", `only the gateway is public (web services: ${publicServices.join(", ") || "none"})`);
  check(typed.filter((service) => service.type !== "web").every((service) => service.type === "pserv"), "every backend is a private service (pserv)");
  check(!/^\s+(?:value):\s*"?[A-Za-z0-9+/_-]{32,}"?\s*$/m.test(blueprint), "no literal secret-looking values (secrets use generateValue or sync: false)");
  for (const key of ["JWT_SECRET", "INTERNAL_API_KEY", "PARTNER_API_KEY", "EXPO_ACCESS_TOKEN", "SMTP_PASS"]) {
    const block = blueprint.match(new RegExp(`key: ${key}\\n\\s+(\\w+):`));
    check(!block || ["generateValue", "sync"].includes(block[1]), `${key} uses generateValue or sync: false`);
  }
  check([...blueprint.matchAll(/ipAllowList: \[\]/g)].length === [...blueprint.matchAll(/databaseName:/g)].length, "every database is private (ipAllowList: [])");
} else {
  warn("deploy/render.yaml not found");
}

// ---------- 6. UTF-8 without BOM ----------
console.log("\n# UTF-8 without BOM (json, yml, yaml, ts, tsx, prisma, sh, mjs; .ps1 may keep a BOM)");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".turbo", "coverage", ".expo"]);
const BOM_EXTENSIONS = /\.(json|ya?ml|tsx?|prisma|sh|mjs)$/;
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path);
  return BOM_EXTENSIONS.test(entry.name) ? [path] : [];
});
const withBom = walk("").filter((path) => readFileSync(join(root, path)).subarray(0, 3).equals(BOM));
const ownBom = withBom.filter(isInfraPath);
check(ownBom.length === 0, `no BOM in infra-owned files${ownBom.length ? ` (found: ${ownBom.join(", ")})` : ""}`);
for (const path of withBom.filter((file) => !isInfraPath(file))) warn(`BOM in another owner's file: ${path}`);

console.log(`\n${results.pass} passed, ${results.fail} failed, ${results.warn} warnings (${relative(process.cwd(), root) || "."})`);
process.exit(results.fail > 0 ? 1 : 0);
