// Data fix 2026-11 "catalog macros": real protein / carbs / fat per 100 g for the 30 staple catalog rows that still
// have the old placeholder (protein 3, carbs 8, fat 1). Same values as catalogMacros in
// services/admin-service/src/seed/catalog.data.ts (4 / 4 / 9 kcal per gram add up to the row's kcal within 5%).
//
// Run inside the auth-service container (it reads ADMIN_EMAIL / ADMIN_PASSWORD from its own environment and never
// prints them); changes go through the gateway as the admin (validation, audit log, promotion sync as usual):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-11-catalog-macros.js
//
// Idempotent: a row is updated only while it still has exactly the placeholder values; other fields are not sent.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const MACROS = {
  "Gạo": [7.1, 79, 0.7], "Thịt bò": [26, 0, 17], "Thịt heo": [17, 0, 19], "Thịt gà": [18.6, 0, 15], "Trứng gà": [12.6, 0.7, 9.5],
  "Tôm": [24, 0.2, 0.3], "Cá basa": [15, 0, 3.4], "Đậu phụ": [8, 1.9, 4.2], "Lạc": [25.8, 13, 45], "Đậu xanh": [23.9, 62.6, 1.2],
  "Sữa tươi": [3.2, 4.8, 3.3], "Sữa chua": [3.5, 4.7, 3.3], "Chuối": [1.1, 20.2, 0.3], "Cam": [0.9, 10.5, 0.1], "Cà chua": [0.9, 3.3, 0.2],
  "Cà rốt": [0.9, 9, 0.2], "Bắp cải": [1.3, 4.8, 0.1], "Rau muống": [2.6, 1.8, 0.2], "Bí đỏ": [1, 5.3, 0.1], "Bông cải xanh": [2.8, 4.8, 0.4],
  "Cải thìa": [1.5, 1.4, 0.2], "Dưa leo": [0.7, 2.8, 0.1], "Gừng": [1.8, 16.4, 0.8], "Hành tây": [1.1, 8.7, 0.1], "Khoai tây": [2, 17.5, 0.1],
  "Nấm rơm": [3.8, 2.6, 0.7], "Táo": [0.3, 12.3, 0.2], "Thanh long": [1.2, 13, 0.4], "Tỏi": [6.4, 29.8, 0.5], "Đậu que": [1.8, 5.4, 0.2],
};
const isPlaceholder = (row) => row.proteinPer100g === 3 && row.carbsPer100g === 8 && row.fatPer100g === 1;

(async () => {
  const login = await fetch(`${GATEWAY}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const auth = await login.json().catch(() => ({}));
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!login.ok || !token) { console.log(`admin login failed (HTTP ${login.status})`); process.exit(1); }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const catalog = await (await fetch(`${GATEWAY}/api/admin/ingredients/export`, { headers })).json().catch(() => null);
  if (!Array.isArray(catalog)) { console.log("could not export the catalog"); process.exit(1); }
  let updated = 0, already = 0;
  for (const [name, [proteinPer100g, carbsPer100g, fatPer100g]] of Object.entries(MACROS)) {
    const row = catalog.find((entry) => entry.name === name);
    if (!row) { console.log(`${name} | not found`); continue; }
    if (!isPlaceholder(row)) { already += 1; continue; }
    const response = await fetch(`${GATEWAY}/api/admin/ingredients/${row.id}`, { method: "PUT", headers, body: JSON.stringify({ proteinPer100g, carbsPer100g, fatPer100g }) });
    console.log(`${name} | ${proteinPer100g} / ${carbsPer100g} / ${fatPer100g} | ${response.ok ? "ok" : `failed (HTTP ${response.status})`}`);
    if (response.ok) updated += 1;
  }
  console.log(`catalog macros: ${updated} updated, ${already} not placeholder (left as they are)`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
