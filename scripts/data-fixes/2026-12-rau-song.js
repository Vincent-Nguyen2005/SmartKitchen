// Data fix 2026-12 "rau sống": "Rau sống" is a plate of mixed fresh greens, not one catalog ingredient.
// 1) The starter recipes list concrete catalog products instead (same values as services/recipe-service/src/seed):
//   Bún chả:  Rau sống 200 g -> Xà lách 130 g + Rau thơm 70 g
//   Mì Quảng: Rau sống 200 g -> Xà lách 80 g + Giá đỗ 70 g + Rau thơm 50 g
//    The matching step and the description name the same vegetables.
// 2) Then the catalog product "Rau sống" is deleted through the admin API (DELETE /api/admin/ingredients/:id), which
//    refuses while a Kho item, a cart line, a recipe or a running promotion still uses it (409 IN_USE: reported, kept)
//    and writes the DELETE audit row, so the startup seed never creates it again. No other product is touched.
//
// DRY RUN by default (prints counts). APPLY=1 writes, through the gateway as the admin (recipe PUT):
//   docker compose -p smartkitchen exec -T auth-service node - < scripts/data-fixes/2026-12-rau-song.js
//   docker compose -p smartkitchen exec -T -e APPLY=1 auth-service node - < scripts/data-fixes/2026-12-rau-song.js
//
// Idempotent. Per dish (by name): already changed -> "already applied"; still the original starter data -> updated;
// anything else (an admin edited it) -> skipped and counted. Only description, ingredients and steps are sent.
// The catalog step runs only when no recipe still lists "Rau sống"; a second run finds the product gone.
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:4000";
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const FIXES = [{"name":"Bún chả","before":{"ingredients":[["Bún",500,"GRAM",null],["Thịt heo xay",300,"GRAM",null],["Thịt ba chỉ",200,"GRAM",null],["Rau sống",200,"GRAM",null],["Nước mắm",null,null,"3 muỗng canh"],["Đường",null,null,"2 muỗng canh"],["Giấm",null,null,"2 muỗng canh"],["Tiêu",null,null,"1/2 muỗng cà phê"],["Tỏi",null,null,"1 muỗng cà phê"],["Ớt",null,null,"vừa ăn"]],"steps":["Ướp thịt heo xay và thịt ba chỉ thái lát","Viên chả, nướng thịt đến khi vàng thơm","Pha nước mắm chua ngọt, thả chả vào","Bày bún và rau sống ra đĩa"],"description":"Chả thịt heo nướng, bún và rau sống, chấm nước mắm chua ngọt."},"after":{"ingredients":[["Bún",500,"GRAM",null],["Thịt heo xay",300,"GRAM",null],["Thịt ba chỉ",200,"GRAM",null],["Xà lách",130,"GRAM",null],["Rau thơm",70,"GRAM",null],["Nước mắm",null,null,"3 muỗng canh"],["Đường",null,null,"2 muỗng canh"],["Giấm",null,null,"2 muỗng canh"],["Tiêu",null,null,"1/2 muỗng cà phê"],["Tỏi",null,null,"1 muỗng cà phê"],["Ớt",null,null,"vừa ăn"]],"steps":["Ướp thịt heo xay và thịt ba chỉ thái lát","Viên chả, nướng thịt đến khi vàng thơm","Pha nước mắm chua ngọt, thả chả vào","Rửa sạch xà lách và rau thơm, để ráo; bày bún và rau ra đĩa"],"description":"Chả thịt heo nướng, bún, xà lách và rau thơm, chấm nước mắm chua ngọt."},"body":{"description":"Chả thịt heo nướng, bún, xà lách và rau thơm, chấm nước mắm chua ngọt.","ingredients":["Bún","Thịt heo xay","Thịt ba chỉ","Xà lách","Rau thơm","Nước mắm","Đường","Giấm","Tiêu","Tỏi","Ớt"],"ingredientDetails":[{"name":"Bún","quantity":500,"unit":"GRAM"},{"name":"Thịt heo xay","quantity":300,"unit":"GRAM"},{"name":"Thịt ba chỉ","quantity":200,"unit":"GRAM"},{"name":"Xà lách","quantity":130,"unit":"GRAM"},{"name":"Rau thơm","quantity":70,"unit":"GRAM"},{"name":"Nước mắm","quantity":null,"unit":null,"note":"3 muỗng canh","isSeasoning":true},{"name":"Đường","quantity":null,"unit":null,"note":"2 muỗng canh","isSeasoning":true},{"name":"Giấm","quantity":null,"unit":null,"note":"2 muỗng canh","isSeasoning":true},{"name":"Tiêu","quantity":null,"unit":null,"note":"1/2 muỗng cà phê","isSeasoning":true},{"name":"Tỏi","quantity":null,"unit":null,"note":"1 muỗng cà phê","isSeasoning":true},{"name":"Ớt","quantity":null,"unit":null,"note":"vừa ăn","isSeasoning":true}],"steps":[{"order":1,"instruction":"Ướp thịt heo xay và thịt ba chỉ thái lát","durationSeconds":1800,"ingredients":[{"name":"Thịt heo xay","quantity":300,"unit":"GRAM"},{"name":"Thịt ba chỉ","quantity":200,"unit":"GRAM"}]},{"order":2,"instruction":"Viên chả, nướng thịt đến khi vàng thơm","durationSeconds":900,"ingredients":[]},{"order":3,"instruction":"Pha nước mắm chua ngọt, thả chả vào","durationSeconds":null,"ingredients":[]},{"order":4,"instruction":"Rửa sạch xà lách và rau thơm, để ráo; bày bún và rau ra đĩa","durationSeconds":null,"ingredients":[{"name":"Bún","quantity":500,"unit":"GRAM"},{"name":"Xà lách","quantity":130,"unit":"GRAM"},{"name":"Rau thơm","quantity":70,"unit":"GRAM"}]}]}},{"name":"Mì Quảng","before":{"ingredients":[["Mì Quảng",600,"GRAM",null],["Thịt heo",200,"GRAM",null],["Tôm",200,"GRAM",null],["Lạc",30,"GRAM",null],["Hành tím",20,"GRAM",null],["Rau sống",200,"GRAM",null],["Muối",null,null,"1 muỗng cà phê"],["Hạt nêm",null,null,"1 muỗng canh"],["Nước mắm",null,null,"2 muỗng canh"],["Tiêu",null,null,"vừa ăn"],["Ớt",null,null,"vừa ăn"],["Dầu điều",null,null,"1 muỗng canh"]],"steps":["Thái thịt heo miếng vừa ăn, ướp với hành tím băm và nước mắm","Phi dầu điều, xào thịt heo săn lại","Cho tôm vào, thêm ít nước, nấu lửa nhỏ đến khi thịt chín mềm, nêm vừa ăn (1 muỗng cà phê muối, 1 muỗng canh hạt nêm, 2 muỗng canh nước mắm, vừa ăn tiêu, 1 muỗng canh dầu điều)","Rang lạc vàng, giã dập","Trụng mì Quảng, cho ra tô cùng rau sống","Chan ít nước nhân, rắc lạc rang"],"description":"Mì Quảng với thịt heo, tôm, lạc rang và rau sống."},"after":{"ingredients":[["Mì Quảng",600,"GRAM",null],["Thịt heo",200,"GRAM",null],["Tôm",200,"GRAM",null],["Lạc",30,"GRAM",null],["Hành tím",20,"GRAM",null],["Xà lách",80,"GRAM",null],["Giá đỗ",70,"GRAM",null],["Rau thơm",50,"GRAM",null],["Muối",null,null,"1 muỗng cà phê"],["Hạt nêm",null,null,"1 muỗng canh"],["Nước mắm",null,null,"2 muỗng canh"],["Tiêu",null,null,"vừa ăn"],["Ớt",null,null,"vừa ăn"],["Dầu điều",null,null,"1 muỗng canh"]],"steps":["Thái thịt heo miếng vừa ăn, ướp với hành tím băm và nước mắm","Phi dầu điều, xào thịt heo săn lại","Cho tôm vào, thêm ít nước, nấu lửa nhỏ đến khi thịt chín mềm, nêm vừa ăn (1 muỗng cà phê muối, 1 muỗng canh hạt nêm, 2 muỗng canh nước mắm, vừa ăn tiêu, 1 muỗng canh dầu điều)","Rang lạc vàng, giã dập","Trụng mì Quảng và giá đỗ, cho ra tô cùng xà lách và rau thơm","Chan ít nước nhân, rắc lạc rang"],"description":"Mì Quảng với thịt heo, tôm, lạc rang, xà lách, giá đỗ và rau thơm."},"body":{"description":"Mì Quảng với thịt heo, tôm, lạc rang, xà lách, giá đỗ và rau thơm.","ingredients":["Mì Quảng","Thịt heo","Tôm","Lạc","Hành tím","Xà lách","Giá đỗ","Rau thơm","Muối","Hạt nêm","Nước mắm","Tiêu","Ớt","Dầu điều"],"ingredientDetails":[{"name":"Mì Quảng","quantity":600,"unit":"GRAM"},{"name":"Thịt heo","quantity":200,"unit":"GRAM"},{"name":"Tôm","quantity":200,"unit":"GRAM"},{"name":"Lạc","quantity":30,"unit":"GRAM"},{"name":"Hành tím","quantity":20,"unit":"GRAM"},{"name":"Xà lách","quantity":80,"unit":"GRAM"},{"name":"Giá đỗ","quantity":70,"unit":"GRAM"},{"name":"Rau thơm","quantity":50,"unit":"GRAM"},{"name":"Muối","quantity":null,"unit":null,"note":"1 muỗng cà phê","isSeasoning":true},{"name":"Hạt nêm","quantity":null,"unit":null,"note":"1 muỗng canh","isSeasoning":true},{"name":"Nước mắm","quantity":null,"unit":null,"note":"2 muỗng canh","isSeasoning":true},{"name":"Tiêu","quantity":null,"unit":null,"note":"vừa ăn","isSeasoning":true},{"name":"Ớt","quantity":null,"unit":null,"note":"vừa ăn","isSeasoning":true},{"name":"Dầu điều","quantity":null,"unit":null,"note":"1 muỗng canh","isSeasoning":true}],"steps":[{"order":1,"instruction":"Thái thịt heo miếng vừa ăn, ướp với hành tím băm và nước mắm","durationSeconds":900,"ingredients":[{"name":"Thịt heo","quantity":200,"unit":"GRAM"},{"name":"Hành tím","quantity":20,"unit":"GRAM"}]},{"order":2,"instruction":"Phi dầu điều, xào thịt heo săn lại","durationSeconds":300,"ingredients":[]},{"order":3,"instruction":"Cho tôm vào, thêm ít nước, nấu lửa nhỏ đến khi thịt chín mềm, nêm vừa ăn (1 muỗng cà phê muối, 1 muỗng canh hạt nêm, 2 muỗng canh nước mắm, vừa ăn tiêu, 1 muỗng canh dầu điều)","durationSeconds":600,"ingredients":[{"name":"Tôm","quantity":200,"unit":"GRAM"},{"name":"Muối","quantity":null,"unit":null,"note":"1 muỗng cà phê","isSeasoning":true},{"name":"Hạt nêm","quantity":null,"unit":null,"note":"1 muỗng canh","isSeasoning":true},{"name":"Nước mắm","quantity":null,"unit":null,"note":"2 muỗng canh","isSeasoning":true},{"name":"Tiêu","quantity":null,"unit":null,"note":"vừa ăn","isSeasoning":true},{"name":"Ớt","quantity":null,"unit":null,"note":"vừa ăn","isSeasoning":true},{"name":"Dầu điều","quantity":null,"unit":null,"note":"1 muỗng canh","isSeasoning":true}]},{"order":4,"instruction":"Rang lạc vàng, giã dập","durationSeconds":300,"ingredients":[{"name":"Lạc","quantity":30,"unit":"GRAM"}]},{"order":5,"instruction":"Trụng mì Quảng và giá đỗ, cho ra tô cùng xà lách và rau thơm","durationSeconds":30,"ingredients":[{"name":"Mì Quảng","quantity":600,"unit":"GRAM"},{"name":"Giá đỗ","quantity":70,"unit":"GRAM"},{"name":"Xà lách","quantity":80,"unit":"GRAM"},{"name":"Rau thơm","quantity":50,"unit":"GRAM"}]},{"order":6,"instruction":"Chan ít nước nhân, rắc lạc rang","durationSeconds":null,"ingredients":[]}]}}];
const fingerprint = (row) => ({
  ingredients: (row.ingredientDetails || []).map((entry) => [entry.name, entry.quantity ?? null, entry.unit ?? null, entry.note ?? null]),
  steps: (row.steps || []).map((step) => step.instruction),
  description: row.description ?? null,
});
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

(async () => {
  const login = await fetch(`${GATEWAY}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const auth = await login.json().catch(() => ({}));
  const token = auth.accessToken ?? auth.data?.accessToken;
  if (!login.ok || !token) { console.log(`admin login failed (HTTP ${login.status})`); process.exit(1); }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const recipes = await (await fetch(`${GATEWAY}/api/recipes`, { headers })).json().catch(() => null);
  if (!Array.isArray(recipes)) { console.log("could not list recipes"); process.exit(1); }
  const counts = { toUpdate: 0, updated: 0, already: 0, edited: 0, missing: 0, failed: 0 };
  for (const fix of FIXES) {
    const row = recipes.find((entry) => entry.name === fix.name);
    if (!row) { counts.missing += 1; continue; }
    const now = fingerprint(row);
    if (same(now, fix.after)) { counts.already += 1; continue; }
    if (!same(now, fix.before)) { counts.edited += 1; continue; }
    counts.toUpdate += 1;
    if (!APPLY) continue;
    const response = await fetch(`${GATEWAY}/api/recipes/${encodeURIComponent(row.id)}`, { method: "PUT", headers, body: JSON.stringify(fix.body) });
    if (response.ok) counts.updated += 1; else counts.failed += 1;
  }
  // 2) Catalog product, once no recipe lists it any more (after the updates above when applying).
  const after = APPLY ? await (await fetch(`${GATEWAY}/api/recipes`, { headers })).json().catch(() => null) : null;
  const stillListed = (Array.isArray(after) ? after : recipes).filter((row) => (row.ingredientDetails || []).some((entry) => entry.name === "Rau sống")).length
    - (APPLY ? 0 : counts.toUpdate);
  const catalog = await (await fetch(`${GATEWAY}/api/admin/ingredients/export`, { headers })).json().catch(() => null);
  if (!Array.isArray(catalog)) { console.log("could not export the catalog"); process.exit(1); }
  const product = catalog.find((row) => row.name.normalize("NFC").trim().toLocaleLowerCase("vi") === "rau sống");
  let catalogResult;
  if (!product) catalogResult = "already deleted";
  else if (stillListed > 0) catalogResult = `kept: ${stillListed} recipe(s) still list it`;
  else if (!APPLY) catalogResult = "would be deleted (the server re-checks Kho, carts, recipes and promotions)";
  else {
    const response = await fetch(`${GATEWAY}/api/admin/ingredients/${encodeURIComponent(product.id)}`, { method: "DELETE", headers });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    catalogResult = response.status === 204 ? "deleted" : response.status === 409 ? `kept, in use (${(body.reasons || []).length} reason(s))` : `not deleted (HTTP ${response.status})`;
  }
  console.log(`${APPLY ? "" : "[dry run] "}catalog "Rau sống": ${catalogResult}; ${catalog.length} catalog product(s) before this step`);
  console.log(`${APPLY ? "" : "[dry run] "}recipes: ${APPLY ? `${counts.updated} updated` : `${counts.toUpdate} would be updated`}, ${counts.already} already applied, ${counts.edited} edited by an admin (skipped), ${counts.missing} not found, ${counts.failed} failed`);
})().catch((error) => { console.log(`error: ${error.message}`); process.exit(1); });
