// Data fix 2026-12 "catalog shelf life": realistic shelf-life days (shelfLifeDays) for catalog products whose value
// was off, because a bought item's expiry is now purchase day (Vietnam) + these days and the item is read-only in Kho.
// Same values as services/admin-service/src/seed/catalog.data.ts. Ranges: leafy greens / herbs 3-4, other vegetables
// and fruits 5-10 (bulbs, tubers, whole pumpkin and ginger longer), fresh meat / fish / seafood 2-3 (fridge),
// processed meats 7-14, eggs 21, milk 7, dry goods / sauces / spices 180-365.
// A product is changed only while it still has the value it had when this script was written ("old"): a value an
// admin set since then is never overwritten. Discount fields are never sent; nothing is deleted.
//
// DRY RUN by default (counts only). APPLY=1 writes, through the gateway as the admin (validation, audit log):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-catalog-shelf-life.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-catalog-shelf-life.js
// Idempotent: a second run finds nothing to change.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const DATA = {"Khoai tây":{"days":30,"old":7},"Cà rốt":{"days":21,"old":7},"Bông cải xanh":{"days":5,"old":7},"Rau muống":{"days":3,"old":7},"Cải thìa":{"days":4,"old":7},"Bắp cải":{"days":14,"old":7},"Hành tây":{"days":30,"old":7},"Tỏi":{"days":60,"old":7},"Gừng":{"days":30,"old":7},"Bí đỏ":{"days":30,"old":7},"Đậu que":{"days":5,"old":7},"Nấm rơm":{"days":3,"old":7},"Chuối":{"days":5,"old":7},"Táo":{"days":21,"old":7},"Cam":{"days":14,"old":7},"Thịt heo":{"days":3,"old":7},"Thịt bò":{"days":3,"old":7},"Thịt gà":{"days":2,"old":7},"Cá basa":{"days":2,"old":7},"Tôm":{"days":2,"old":7},"Trứng gà":{"days":21,"old":7},"Sữa chua":{"days":14,"old":7},"Gạo":{"days":365,"old":7},"Đậu xanh":{"days":365,"old":7},"Lạc":{"days":180,"old":7},"Đậu phụ":{"days":3,"old":7},"Rau mùi":{"days":4,"old":5},"Xà lách":{"days":4,"old":5},"Hành lá":{"days":4,"old":5}};
const key = (value) => String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const login = await fetch(`${GATEWAY}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const auth = await login.json().catch(() => ({}));
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!login.ok || !token) { console.log(`admin login failed (HTTP ${login.status})`); process.exit(1); }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const send = async (method, path, body) => {
    for (let attempt = 0; ; attempt += 1) {
      await sleep(250);
      const response = await fetch(`${GATEWAY}${path}`, { method, headers, body: JSON.stringify(body) });
      if (response.status !== 429 || attempt >= 3) return response;
      await sleep(Math.min(60, Number(response.headers.get("retry-after")) || 30) * 1000);
    }
  };
  const catalog = await (await fetch(`${GATEWAY}/api/admin/ingredients/export`, { headers })).json().catch(() => null);
  if (!Array.isArray(catalog)) { console.log("could not export the catalog"); process.exit(1); }
  const byKey = new Map(catalog.map((row) => [key(row.name), row]));
  const counts = { change: 0, done: 0, edited: 0, missing: 0, failed: 0 };
  for (const [name, entry] of Object.entries(DATA)) {
    const row = byKey.get(key(name));
    if (!row) { counts.missing += 1; continue; }
    if (row.shelfLifeDays === entry.days) { counts.done += 1; continue; }
    if (row.shelfLifeDays !== entry.old) { counts.edited += 1; continue; }
    counts.change += 1;
    if (APPLY) { const response = await send("PUT", `/api/admin/ingredients/${row.id}`, { shelfLifeDays: entry.days }); if (!response.ok) counts.failed += 1; }
  }
  console.log(`${APPLY ? "" : "[dry run] "}shelf life: ${counts.change} product(s) ${APPLY ? "updated" : "to update"}, ${counts.done} already done, ${counts.edited} changed by an admin (skipped), ${counts.missing} not found, ${counts.failed} failed`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
