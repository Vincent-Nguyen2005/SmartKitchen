// Data fix 2026-12 "catalog sale units": nothing in the catalog is sold by the gram any more.
// Same values as services/admin-service/src/seed/catalog-details.ts (unit / price / packGrams) + catalog.data.ts (kcal).
// - Meat, fish, seafood, vegetables, mushrooms, tubers, beans: GRAM -> KILOGRAM, price per kg (Đi chợ: 0.1 kg steps).
//   An admin-set per-gram price is kept, converted to per kg (x 1000, rounded to 500 VND).
// - Small aromatics (Hành lá, Rau mùi, Sả, Ớt, Gừng, Tỏi, Hành tím, Mè): GRAM -> PACK (bó / gói) with a round pack
//   price and packGrams (grams in one pack) so recipe grams convert to packs. A product whose per-gram price an admin
//   changed is left alone (counted as "edited").
// - Macro fix: Thịt ba chỉ 350 kcal (14 / 0 / 32.5), Thịt vịt with skin 400 kcal (11.5 / 0 / 39.3), only while the
//   row still has the old starter values.
// Only rows still on GRAM are converted; discount fields are never sent; nothing is deleted.
//
// DRY RUN by default (counts only). APPLY=1 writes, through the gateway as the admin (validation, audit log):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-catalog-sale-units.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-catalog-sale-units.js
// Idempotent: a second run finds nothing to change.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const SALE = {"Sườn heo":{"unit":"KILOGRAM","price":190000,"packGrams":null,"oldPerGram":190.0},"Thịt ba chỉ":{"unit":"KILOGRAM","price":170000,"packGrams":null,"oldPerGram":170.0},"Thịt bò":{"unit":"KILOGRAM","price":300000,"packGrams":null,"oldPerGram":300.0},"Thịt gà":{"unit":"KILOGRAM","price":100000,"packGrams":null,"oldPerGram":100.0},"Thịt heo":{"unit":"KILOGRAM","price":140000,"packGrams":null,"oldPerGram":140.0},"Thịt heo xay":{"unit":"KILOGRAM","price":130000,"packGrams":null,"oldPerGram":130.0},"Thịt vịt":{"unit":"KILOGRAM","price":90000,"packGrams":null,"oldPerGram":90.0},"Đùi gà":{"unit":"KILOGRAM","price":90000,"packGrams":null,"oldPerGram":90.0},"Cá hồi":{"unit":"KILOGRAM","price":450000,"packGrams":null,"oldPerGram":450.0},"Cá thu":{"unit":"KILOGRAM","price":250000,"packGrams":null,"oldPerGram":250.0},"Cua đồng":{"unit":"KILOGRAM","price":150000,"packGrams":null,"oldPerGram":150.0},"Mực":{"unit":"KILOGRAM","price":280000,"packGrams":null,"oldPerGram":280.0},"Nghêu":{"unit":"KILOGRAM","price":60000,"packGrams":null,"oldPerGram":60.0},"Tôm":{"unit":"KILOGRAM","price":300000,"packGrams":null,"oldPerGram":300.0},"Bí xanh":{"unit":"KILOGRAM","price":25000,"packGrams":null,"oldPerGram":25.0},"Cà tím":{"unit":"KILOGRAM","price":30000,"packGrams":null,"oldPerGram":30.0},"Cải xanh":{"unit":"KILOGRAM","price":30000,"packGrams":null,"oldPerGram":30.0},"Củ cải trắng":{"unit":"KILOGRAM","price":20000,"packGrams":null,"oldPerGram":20.0},"Giá đỗ":{"unit":"KILOGRAM","price":20000,"packGrams":null,"oldPerGram":20.0},"Khổ qua":{"unit":"KILOGRAM","price":35000,"packGrams":null,"oldPerGram":35.0},"Rau ngót":{"unit":"KILOGRAM","price":40000,"packGrams":null,"oldPerGram":40.0},"Súp lơ trắng":{"unit":"KILOGRAM","price":50000,"packGrams":null,"oldPerGram":50.0},"Xà lách":{"unit":"KILOGRAM","price":50000,"packGrams":null,"oldPerGram":50.0},"Đậu bắp":{"unit":"KILOGRAM","price":30000,"packGrams":null,"oldPerGram":30.0},"Đậu que":{"unit":"KILOGRAM","price":35000,"packGrams":null,"oldPerGram":35.0},"Khoai lang":{"unit":"KILOGRAM","price":30000,"packGrams":null,"oldPerGram":30.0},"Nấm hương":{"unit":"KILOGRAM","price":150000,"packGrams":null,"oldPerGram":150.0},"Nấm mỡ":{"unit":"KILOGRAM","price":120000,"packGrams":null,"oldPerGram":120.0},"Nấm rơm":{"unit":"KILOGRAM","price":120000,"packGrams":null,"oldPerGram":120.0},"Đậu xanh":{"unit":"KILOGRAM","price":60000,"packGrams":null,"oldPerGram":60.0},"Đậu đen":{"unit":"KILOGRAM","price":55000,"packGrams":null,"oldPerGram":55.0},"Lạc":{"unit":"KILOGRAM","price":70000,"packGrams":null,"oldPerGram":70.0},"Hành lá":{"unit":"PACK","price":5000,"packGrams":100,"oldPerGram":60.0},"Rau mùi":{"unit":"PACK","price":5000,"packGrams":50,"oldPerGram":80.0},"Sả":{"unit":"PACK","price":5000,"packGrams":150,"oldPerGram":30.0},"Ớt":{"unit":"PACK","price":8000,"packGrams":100,"oldPerGram":80.0},"Gừng":{"unit":"PACK","price":6000,"packGrams":100,"oldPerGram":60.0},"Tỏi":{"unit":"PACK","price":15000,"packGrams":200,"oldPerGram":70.0},"Hành tím":{"unit":"PACK","price":16000,"packGrams":200,"oldPerGram":80.0},"Mè":{"unit":"PACK","price":12000,"packGrams":100,"oldPerGram":120.0}};
const KCAL = {"Thịt ba chỉ":{"kcal":350,"macros":[14,0,32.5],"oldKcal":518,"oldMacros":[9.3,0,53]},"Thịt vịt":{"kcal":400,"macros":[11.5,0,39.3],"oldKcal":337,"oldMacros":[13,0,30]}};
const key = (value) => String(value).normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameMacros = (row, macros) => row.proteinPer100g === macros[0] && row.carbsPer100g === macros[1] && row.fatPer100g === macros[2];

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
  const counts = { rows: 0, kg: 0, pack: 0, keptPrice: 0, macros: 0, edited: 0, done: 0, missing: 0, failed: 0 };

  for (const name of new Set([...Object.keys(SALE), ...Object.keys(KCAL)])) {
    const row = byKey.get(key(name));
    if (!row) { counts.missing += 1; continue; }
    const body = {};
    const sale = SALE[name];
    if (sale && row.defaultUnit === "GRAM") {
      const starterPrice = row.price === null || row.price === 0 || row.price === sale.oldPerGram;
      if (sale.unit === "KILOGRAM") {
        body.defaultUnit = "KILOGRAM";
        body.price = starterPrice ? sale.price : Math.max(500, Math.round((row.price * 1000) / 500) * 500);
        if (!starterPrice) counts.keptPrice += 1;
        counts.kg += 1;
      } else if (starterPrice) {
        body.defaultUnit = sale.unit; body.price = sale.price; counts.pack += 1;
      } else counts.edited += 1;
    }
    if (sale && sale.packGrams && row.packGrams == null && (body.defaultUnit ?? row.defaultUnit) === sale.unit) body.packGrams = sale.packGrams;
    const fix = KCAL[name];
    if (fix && row.caloriesPer100g === fix.oldKcal && sameMacros(row, fix.oldMacros)) {
      body.caloriesPer100g = fix.kcal; [body.proteinPer100g, body.carbsPer100g, body.fatPer100g] = fix.macros; counts.macros += 1;
    }
    if (Object.keys(body).length === 0) { counts.done += 1; continue; }
    counts.rows += 1;
    if (APPLY) { const response = await send("PUT", `/api/admin/ingredients/${row.id}`, body); if (!response.ok) counts.failed += 1; }
  }
  console.log(`${APPLY ? "" : "[dry run] "}sale units: ${counts.rows} product(s) ${APPLY ? "updated" : "to update"} (kg ${counts.kg}, of which admin price kept ${counts.keptPrice}; pack ${counts.pack}; macros ${counts.macros}), ${counts.done} already done, ${counts.edited} edited by an admin (skipped), ${counts.missing} not found, ${counts.failed} failed; GRAM products before this run: ${catalog.filter((row) => row.defaultUnit === "GRAM").length}`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
