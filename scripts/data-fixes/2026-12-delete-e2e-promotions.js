// Data fix 2026-12 "delete e2e promotions": removes test leftovers, i.e. promotions whose title starts with "e2e-"
// (the smoke test used to ingest "e2e-promotion" ending 01/01/2099 and never deleted it).
//
// DRY RUN by default: prints how many it would delete. To delete, set APPLY=1:
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-delete-e2e-promotions.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-delete-e2e-promotions.js
//
// Runs inside the auth-service container (ADMIN_EMAIL / ADMIN_PASSWORD from its own environment, never printed);
// deletes through the gateway as the admin (DELETE /api/notifications/promotions/:id). Idempotent: a second run
// finds nothing. Prints counts only.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const PREFIX = "e2e-";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const login = await fetch(`${GATEWAY}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const auth = await login.json().catch(() => ({}));
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!login.ok || !token) { console.log(`admin login failed (HTTP ${login.status})`); process.exit(1); }
  const headers = { authorization: `Bearer ${token}` };

  // All promotions whose title contains the prefix (server search is case-insensitive), then exact "starts with".
  const found = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`${GATEWAY}/api/notifications/promotions?keyword=${encodeURIComponent(PREFIX)}&limit=100&page=${page}`, { headers });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.items)) { console.log(`could not list promotions (HTTP ${response.status})`); process.exit(1); }
    found.push(...body.items.filter((item) => typeof item.title === "string" && item.title.startsWith(PREFIX)));
    if (body.items.length < 100) break;
  }
  if (!APPLY) { console.log(`[dry run] ${found.length} promotion(s) with a title starting "${PREFIX}" would be deleted. Set APPLY=1 to delete.`); return; }

  let deleted = 0, failed = 0;
  for (const promotion of found) {
    await sleep(250);
    const response = await fetch(`${GATEWAY}/api/notifications/promotions/${encodeURIComponent(promotion.id)}`, { method: "DELETE", headers });
    if (response.ok || response.status === 404) deleted += 1; else failed += 1;
  }
  console.log(`e2e promotions: ${deleted} deleted, ${failed} failed (of ${found.length} found)`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
