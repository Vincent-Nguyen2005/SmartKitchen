// Data fix 2026-12 "catalog recipe weights": "Cần mua tuần này" converts every recipe amount to the product's sale unit.
// Same values as services/admin-service/src/seed/catalog-details.ts (packGrams, pieceGrams).
// - packGrams: weight of one pack for the PACK products recipes use (31; Sả and Ớt already had one) (Bún 1 gói ≈ 500 g), so "450 g bún" → 1 gói.
//   Set only when empty, only on PACK rows.
// - pieceGrams: typical weight of ONE piece for KILOGRAM / PACK products recipes count in pieces (Cà chua 1 quả ≈
//   100 g, Bánh tráng 1 lá ≈ 10 g), so "3 quả cà chua" → 0,3 kg. Set only when empty. Needs the pieceGrams column
//   (admin-service migration 20261211000000_ingredient_piece_grams): rebuild admin-service first.
// Only rows whose sale unit is still the one below are touched; a value an admin set is never overwritten;
// discount fields are never sent; nothing is deleted.
//
// DRY RUN by default (counts only). APPLY=1 writes, through the gateway as the admin (validation, audit log):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-catalog-recipe-weights.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-catalog-recipe-weights.js
// Idempotent: a second run finds nothing to change.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const DATA = {"Bánh canh":{"unit":"PACK","packGrams":500},"Bánh cuốn":{"unit":"PACK","packGrams":500},"Bánh mì sandwich":{"unit":"PACK","packGrams":400,"pieceGrams":25},"Bánh phở":{"unit":"PACK","packGrams":500},"Bánh tráng":{"unit":"PACK","packGrams":300,"pieceGrams":10},"Bún":{"unit":"PACK","packGrams":500},"Bơ lạt":{"unit":"PACK","packGrams":200},"Bột chiên giòn":{"unit":"PACK","packGrams":150},"Bột cà ri":{"unit":"PACK","packGrams":25},"Chuối":{"unit":"PACK","packGrams":1000,"pieceGrams":120},"Cải ngọt":{"unit":"PACK","packGrams":300},"Cải thìa":{"unit":"PACK","packGrams":300},"Cần tây":{"unit":"PACK","packGrams":200},"Hủ tiếu":{"unit":"PACK","packGrams":500},"Kim chi":{"unit":"PACK","packGrams":300},"Lạp xưởng":{"unit":"PACK","packGrams":500,"pieceGrams":40},"Mì Quảng":{"unit":"PACK","packGrams":500},"Mì gói":{"unit":"PACK","packGrams":75},"Mì Ý":{"unit":"PACK","packGrams":500},"Nấm mèo":{"unit":"PACK","packGrams":50},"Phô mai":{"unit":"PACK","packGrams":200},"Rau lang":{"unit":"PACK","packGrams":300},"Rau muống":{"unit":"PACK","packGrams":500},"Rau thơm":{"unit":"PACK","packGrams":100},"Rong biển":{"unit":"PACK","packGrams":50},"Thịt cua":{"unit":"PACK","packGrams":200},"Thịt xông khói":{"unit":"PACK","packGrams":200},"Trà xanh":{"unit":"PACK","packGrams":100},"Xúc xích":{"unit":"PACK","packGrams":500,"pieceGrams":50},"Yến mạch":{"unit":"PACK","packGrams":500},"Đậu Hà Lan":{"unit":"PACK","packGrams":500},"Sả":{"unit":"PACK","packGrams":150,"pieceGrams":25},"Ớt":{"unit":"PACK","packGrams":100,"pieceGrams":5},"Cà chua":{"unit":"KILOGRAM","pieceGrams":100},"Cà rốt":{"unit":"KILOGRAM","pieceGrams":150},"Cam":{"unit":"KILOGRAM","pieceGrams":200},"Dưa leo":{"unit":"KILOGRAM","pieceGrams":200},"Hành tây":{"unit":"KILOGRAM","pieceGrams":150},"Khoai tây":{"unit":"KILOGRAM","pieceGrams":150},"Khổ qua":{"unit":"KILOGRAM","pieceGrams":250},"Táo":{"unit":"KILOGRAM","pieceGrams":200},"Cà tím":{"unit":"KILOGRAM","pieceGrams":250},"Khoai lang":{"unit":"KILOGRAM","pieceGrams":250},"Su su":{"unit":"KILOGRAM","pieceGrams":300},"Củ cải trắng":{"unit":"KILOGRAM","pieceGrams":400},"Bắp cải":{"unit":"KILOGRAM","pieceGrams":1000},"Súp lơ trắng":{"unit":"KILOGRAM","pieceGrams":500},"Bí xanh":{"unit":"KILOGRAM","pieceGrams":800},"Bí đỏ":{"unit":"KILOGRAM","pieceGrams":1500},"Đùi gà":{"unit":"KILOGRAM","pieceGrams":250}};
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
  if (catalog.length > 0 && !("pieceGrams" in catalog[0])) { console.log("admin-service has no pieceGrams column yet: rebuild it first"); process.exit(1); }
  const byKey = new Map(catalog.map((row) => [key(row.name), row]));
  const counts = { rows: 0, pack: 0, piece: 0, done: 0, otherUnit: 0, missing: 0, failed: 0 };
  for (const [name, entry] of Object.entries(DATA)) {
    const row = byKey.get(key(name));
    if (!row) { counts.missing += 1; continue; }
    if (row.defaultUnit !== entry.unit) { counts.otherUnit += 1; continue; }
    const body = {};
    if (entry.packGrams && row.packGrams == null) { body.packGrams = entry.packGrams; counts.pack += 1; }
    if (entry.pieceGrams && row.pieceGrams == null) { body.pieceGrams = entry.pieceGrams; counts.piece += 1; }
    if (Object.keys(body).length === 0) { counts.done += 1; continue; }
    counts.rows += 1;
    if (APPLY) { const response = await send("PUT", `/api/admin/ingredients/${row.id}`, body); if (!response.ok) counts.failed += 1; }
  }
  console.log(`${APPLY ? "" : "[dry run] "}recipe weights: ${counts.rows} product(s) ${APPLY ? "updated" : "to update"} (pack weight ${counts.pack}, piece weight ${counts.piece}), ${counts.done} already done, ${counts.otherUnit} with another sale unit (skipped), ${counts.missing} not found, ${counts.failed} failed`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
