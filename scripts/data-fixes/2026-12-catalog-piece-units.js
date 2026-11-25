// Data fix 2026-12 "catalog piece units": Đi chợ shows "1 quả ≈ 1,2 kg", "1 chai ≈ 500 ml".
// Same values as services/admin-service/src/seed/catalog-details.ts (packGrams, unitLabel).
// - packGrams: typical weight of one piece-type sale unit (grams; ml for bottles), for the 36 PIECE / BOTTLE / CAN /
//   BOX products. Set only when empty.
// - unitLabel: the specific word for PIECE products ("quả", "trái", "cái", "bìa"). Set only when empty.
// Only rows whose sale unit is still the one below are touched; a value an admin set is never overwritten;
// discount fields are never sent; nothing is deleted.
//
// DRY RUN by default (counts only). APPLY=1 writes, through the gateway as the admin (validation, audit log):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-catalog-piece-units.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-catalog-piece-units.js
// Idempotent: a second run finds nothing to change. Run after rebuilding admin-service (needs the unitLabel column).
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const DATA = {"Bánh mì":{"unit":"PIECE","unitLabel":"cái","grams":80},"Bông cải xanh":{"unit":"PIECE","unitLabel":"cái","grams":400},"Bưởi":{"unit":"PIECE","unitLabel":"quả","grams":1200},"Chanh":{"unit":"PIECE","unitLabel":"quả","grams":50},"Dứa":{"unit":"PIECE","unitLabel":"quả","grams":1000},"Ngô ngọt":{"unit":"PIECE","unitLabel":"trái","grams":300},"Ổi":{"unit":"PIECE","unitLabel":"quả","grams":200},"Ớt chuông":{"unit":"PIECE","unitLabel":"quả","grams":200},"Quả bơ":{"unit":"PIECE","unitLabel":"quả","grams":250},"Thanh long":{"unit":"PIECE","unitLabel":"quả","grams":400},"Trứng gà":{"unit":"PIECE","unitLabel":"quả","grams":55},"Trứng vịt":{"unit":"PIECE","unitLabel":"quả","grams":70},"Xoài":{"unit":"PIECE","unitLabel":"quả","grams":400},"Đậu phụ":{"unit":"PIECE","unitLabel":"bìa","grams":200},"Đu đủ":{"unit":"PIECE","unitLabel":"quả","grams":1000},"Dầu ăn":{"unit":"BOTTLE","unitLabel":null,"grams":1000},"Dầu mè":{"unit":"BOTTLE","unitLabel":null,"grams":250},"Dầu ô liu":{"unit":"BOTTLE","unitLabel":null,"grams":500},"Dầu điều":{"unit":"BOTTLE","unitLabel":null,"grams":100},"Giấm":{"unit":"BOTTLE","unitLabel":null,"grams":500},"Nước dừa":{"unit":"BOTTLE","unitLabel":null,"grams":330},"Nước mắm":{"unit":"BOTTLE","unitLabel":null,"grams":500},"Nước tương":{"unit":"BOTTLE","unitLabel":null,"grams":500},"Sốt cà chua":{"unit":"BOTTLE","unitLabel":null,"grams":250},"Sữa tươi":{"unit":"BOTTLE","unitLabel":null,"grams":1000},"Sữa đậu nành":{"unit":"BOTTLE","unitLabel":null,"grams":1000},"Tương cà":{"unit":"BOTTLE","unitLabel":null,"grams":250},"Tương ớt":{"unit":"BOTTLE","unitLabel":null,"grams":250},"Nước cốt dừa":{"unit":"CAN","unitLabel":null,"grams":400},"Pa tê":{"unit":"CAN","unitLabel":null,"grams":170},"Sữa đặc":{"unit":"CAN","unitLabel":null,"grams":380},"Kem":{"unit":"BOX","unitLabel":null,"grams":450},"Kem tươi":{"unit":"BOX","unitLabel":null,"grams":250},"Mắm ruốc":{"unit":"BOX","unitLabel":null,"grams":200},"Sữa chua":{"unit":"BOX","unitLabel":null,"grams":100},"Tương ớt Hàn":{"unit":"BOX","unitLabel":null,"grams":500}};
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
  if (catalog.length > 0 && !("unitLabel" in catalog[0])) { console.log("admin-service has no unitLabel column yet: rebuild it first"); process.exit(1); }
  const byKey = new Map(catalog.map((row) => [key(row.name), row]));
  const counts = { rows: 0, weight: 0, label: 0, done: 0, otherUnit: 0, missing: 0, failed: 0 };
  for (const [name, entry] of Object.entries(DATA)) {
    const row = byKey.get(key(name));
    if (!row) { counts.missing += 1; continue; }
    if (row.defaultUnit !== entry.unit) { counts.otherUnit += 1; continue; }
    const body = {};
    if (row.packGrams == null) { body.packGrams = entry.grams; counts.weight += 1; }
    if (entry.unitLabel && row.unitLabel == null) { body.unitLabel = entry.unitLabel; counts.label += 1; }
    if (Object.keys(body).length === 0) { counts.done += 1; continue; }
    counts.rows += 1;
    if (APPLY) { const response = await send("PUT", `/api/admin/ingredients/${row.id}`, body); if (!response.ok) counts.failed += 1; }
  }
  console.log(`${APPLY ? "" : "[dry run] "}piece units: ${counts.rows} product(s) ${APPLY ? "updated" : "to update"} (weight ${counts.weight}, unit word ${counts.label}), ${counts.done} already done, ${counts.otherUnit} with another sale unit (skipped), ${counts.missing} not found, ${counts.failed} failed`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
