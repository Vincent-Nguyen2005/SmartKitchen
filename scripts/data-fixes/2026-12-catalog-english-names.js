// Data fix 2026-12 "catalog English names": fills the optional englishName (photo recognition alias, e.g. "carrot")
// on catalog rows that do not have one yet. Same values as the starter seed (services/admin-service/src/seed/
// catalog.data.ts: `en`, with ENGLISH_NAME_OVERRIDES).
//
// Run inside the auth-service container (it reads ADMIN_EMAIL / ADMIN_PASSWORD from its own environment and never
// prints them); changes go through the gateway as the admin:
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-catalog-english-names.js
//
// Idempotent: only rows whose englishName is empty are updated; an alias an admin typed is never changed.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const ENGLISH = {"Cà chua":"tomato","Khoai tây":"potato","Cà rốt":"carrot","Bông cải xanh":"broccoli","Súp lơ trắng":"cauliflower","Rau muống":"water spinach","Cải thìa":"bok choy","Bắp cải":"cabbage","Dưa leo":"cucumber","Hành tây":"onion","Tỏi":"garlic","Gừng":"ginger root","Hành lá":"scallion","Ớt":"chili pepper","Sả":"lemongrass","Bí đỏ":"pumpkin","Bí xanh":"winter melon","Khổ qua":"bitter melon","Đậu que":"green beans","Đậu bắp":"okra","Cà tím":"eggplant","Rau ngót":"katuk leaves","Cải xanh":"mustard greens","Xà lách":"lettuce","Giá đỗ":"mung bean sprouts","Nấm rơm":"straw mushroom","Nấm hương":"shiitake","Khoai lang":"sweet potato","Củ cải trắng":"daikon","Ngô ngọt":"sweet corn","Hành tím":"shallot","Rau mùi":"coriander leaves","Chuối":"banana","Táo":"apple","Cam":"orange fruit","Thanh long":"dragon fruit","Xoài":"mango","Dưa hấu":"watermelon","Đu đủ":"papaya","Bưởi":"pomelo","Dứa":"pineapple","Ổi":"guava","Chanh":"lime fruit","Nho":"grapes","Thịt heo":"pork meat","Thịt ba chỉ":"pork belly","Sườn heo":"pork ribs","Thịt bò":"beef meat","Thịt gà":"chicken meat","Đùi gà":"chicken drumstick","Thịt vịt":"duck meat","Thịt heo xay":"ground pork","Cá basa":"white fish fillet","Cá thu":"mackerel fish","Cá hồi":"salmon fillet","Tôm":"shrimp","Mực":"squid","Cua đồng":"freshwater crab","Nghêu":"clams","Trứng gà":"chicken eggs","Trứng vịt":"duck eggs","Sữa tươi":"a carton of milk","Sữa chua":"yogurt","Phô mai":"cheese","Bơ lạt":"butter","Gạo":"uncooked white rice","Gạo nếp":"glutinous rice","Bún":"rice vermicelli","Bánh phở":"flat rice noodles","Mì gói":"instant noodles","Miến":"glass noodles","Đậu xanh":"mung beans","Lạc":"peanuts","Đậu phụ":"tofu","Bột mì":"wheat flour","Đậu đen":"black beans","Mè":"sesame seeds","Bánh mì":"baguette bread","Muối":"table salt","Đường":"white sugar","Nước mắm":"fish sauce","Nước tương":"soy sauce","Dầu ăn":"cooking oil","Tiêu":"black pepper","Hạt nêm":"bouillon powder","Giấm":"vinegar","Tương ớt":"chili sauce","Nước dừa":"coconut water","Trà xanh":"green tea leaves","Cà phê":"coffee beans","Sữa đậu nành":"soy milk","Xúc xích":"sausage","Chả giò":"cha gio spring rolls","Há cảo":"har gow dumplings","Kem":"ice cream","Đậu Hà Lan":"green peas","Mì Ý":"spaghetti pasta","Rong biển":"nori seaweed sheets","Bánh mì sandwich":"sliced white bread","Sốt cà chua":"tomato pasta sauce","Bột cà ri":"curry powder","Tương ớt Hàn":"gochujang","Kem tươi":"whipping cream","Quả bơ":"avocado fruit","Ớt chuông":"bell pepper","Nấm mỡ":"button mushroom","Thịt xông khói":"bacon","Kim chi":"kimchi"};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The gateway rate-limits bursts: pace the updates and wait as long as a 429 asks (Retry-After, at most 60 s).
async function putWithRetry(url, headers, body) {
  for (let attempt = 0; ; attempt += 1) {
    await sleep(250);
    const response = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
    if (response.status !== 429 || attempt >= 3) return response;
    await sleep(Math.min(60, Number(response.headers.get("retry-after")) || 30) * 1000);
  }
}

(async () => {
  const login = await fetch(`${GATEWAY}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const auth = await login.json().catch(() => ({}));
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!login.ok || !token) { console.log(`admin login failed (HTTP ${login.status})`); process.exit(1); }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const catalog = await (await fetch(`${GATEWAY}/api/admin/ingredients/export`, { headers })).json().catch(() => null);
  if (!Array.isArray(catalog)) { console.log("could not export the catalog"); process.exit(1); }
  let updated = 0, already = 0;
  const unknown = [];
  for (const row of catalog) {
    if (row.englishName && String(row.englishName).trim()) { already += 1; continue; }
    const englishName = ENGLISH[row.name];
    if (!englishName) { unknown.push(row.name); continue; }
    const response = await putWithRetry(`${GATEWAY}/api/admin/ingredients/${row.id}`, headers, { englishName });
    if (response.ok) updated += 1; else console.log(`${row.name} | failed (HTTP ${response.status})`);
  }
  console.log(`english names: ${updated} updated, ${already} already set, ${unknown.length} without a known alias${unknown.length ? ` (${unknown.join(", ")})` : ""}`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
