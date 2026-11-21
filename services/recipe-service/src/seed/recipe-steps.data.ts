import { seedRecipes, type SeedRecipe } from "./recipes.data";

/** One step: instruction, timer in seconds (null = no timer), names of the dish's ingredients added now. */
type StepRow = [instruction: string, seconds: number | null, ingredients: string[]];

/**
 * Home-cooking steps for the starter dishes (keyed by dish name). Ingredient names must match the dish's
 * ingredient list in recipes.data.ts; quantities and units are taken from there.
 */
const STEPS: Record<string, StepRow[]> = {
  "Phở bò": [
    ["Nướng thơm hành tây và gừng trên bếp", 300, ["Hành tây", "Gừng"]],
    ["Cho hành, gừng vào nồi nước, đun sôi rồi hạ lửa ninh nước dùng", 1800, []],
    ["Thái thịt bò thật mỏng", null, ["Thịt bò"]],
    ["Trụng bánh phở qua nước sôi rồi cho ra tô", 30, ["Bánh phở"]],
    ["Xếp thịt bò lên bánh, chan nước dùng thật sôi, rắc hành lá", null, ["Hành lá"]],
  ],
  "Bánh mì trứng ốp la": [
    ["Rửa sạch, thái lát dưa leo và cà chua", null, ["Dưa leo", "Cà chua"]],
    ["Làm nóng chảo với chút dầu", 60, []],
    ["Đập trứng vào chảo, chiên lửa vừa đến khi lòng trắng chín", 180, ["Trứng gà"]],
    ["Nướng giòn bánh mì", 120, ["Bánh mì"]],
    ["Kẹp trứng cùng dưa leo, cà chua vào bánh mì", null, []],
  ],
  "Xôi đậu xanh": [
    ["Ngâm gạo nếp và đậu xanh trong nước", 3600, ["Gạo nếp", "Đậu xanh"]],
    ["Để ráo, trộn gạo nếp với đậu xanh và chút muối", null, []],
    ["Hấp xôi đến khi hạt nếp chín dẻo", 1800, []],
    ["Phi hành tím với dầu đến khi vàng giòn", 120, ["Hành tím"]],
    ["Xới xôi ra đĩa, rắc hành phi lên trên", null, []],
  ],
  "Cháo gà": [
    ["Vo sạch gạo, rang sơ cho thơm", 180, ["Gạo"]],
    ["Luộc thịt gà với gừng đến khi chín", 1200, ["Thịt gà", "Gừng"]],
    ["Vớt gà ra xé nhỏ, cho gạo vào nước luộc gà nấu cháo", 1200, []],
    ["Cho thịt gà xé vào cháo, nêm vừa ăn", 120, []],
    ["Múc ra tô, rắc hành lá", null, ["Hành lá"]],
  ],
  "Cháo yến mạch chuối sữa": [
    ["Cho yến mạch và sữa tươi vào nồi", null, ["Yến mạch", "Sữa tươi"]],
    ["Nấu lửa nhỏ, khuấy đều đến khi sánh", 300, []],
    ["Cắt lát chuối", null, ["Chuối"]],
    ["Múc cháo ra bát, xếp chuối lên trên", null, []],
  ],
  "Bún riêu cua": [
    ["Lọc cua lấy nước, để riêng phần gạch", null, ["Cua đồng"]],
    ["Đun nước cua lửa nhỏ đến khi riêu nổi lên", 900, []],
    ["Phi thơm rồi xào cà chua cho mềm", 180, ["Cà chua"]],
    ["Cho cà chua, đậu phụ chiên và trứng đánh tan vào nồi", 300, ["Đậu phụ", "Trứng gà"]],
    ["Trụng bún, cho ra tô và chan nước riêu", null, ["Bún"]],
  ],
  "Hủ tiếu Nam Vang": [
    ["Luộc thịt heo trong nồi nước dùng", 900, ["Thịt heo"]],
    ["Vớt thịt ra thái lát, cho tôm vào luộc chín", 180, ["Tôm"]],
    ["Trụng hủ tiếu và giá đỗ", 30, ["Hủ tiếu", "Giá đỗ"]],
    ["Xếp hủ tiếu, thịt, tôm ra tô và chan nước dùng", null, []],
  ],
  "Bún bò Huế": [
    ["Đập dập sả, cho vào nồi nước cùng giò heo", null, ["Sả", "Giò heo"]],
    ["Ninh giò heo đến khi mềm", 3600, []],
    ["Cho thịt bò vào luộc chín rồi vớt ra thái lát", 900, ["Thịt bò"]],
    ["Trụng bún, cho ra tô", 30, ["Bún"]],
    ["Xếp thịt bò, giò heo lên bún và chan nước dùng", null, []],
  ],
  "Bò kho": [
    ["Cắt thịt bò miếng vừa ăn, ướp với sả băm", 900, ["Thịt bò", "Sả"]],
    ["Xào săn thịt bò", 300, []],
    ["Đổ nước ngập thịt, hầm lửa nhỏ", 3600, []],
    ["Cho cà rốt vào hầm đến khi mềm", 900, ["Cà rốt"]],
    ["Múc ra bát, ăn kèm bánh mì", null, ["Bánh mì"]],
  ],
  "Thịt kho trứng": [
    ["Luộc trứng, bóc vỏ", 600, ["Trứng gà"]],
    ["Cắt thịt ba chỉ miếng vuông, ướp gia vị", 900, ["Thịt ba chỉ"]],
    ["Thắng đường lấy màu rồi cho thịt vào đảo săn", 300, []],
    ["Đổ nước dừa, cho trứng vào, kho lửa nhỏ", 2700, ["Nước dừa"]],
  ],
  "Cá kho tộ": [
    ["Làm sạch cá, cắt khúc", null, ["Cá basa"]],
    ["Ướp cá với hành tím, ớt và gia vị", 900, ["Hành tím", "Ớt"]],
    ["Kho cá lửa vừa, trở mặt một lần", 1200, []],
    ["Hạ lửa nhỏ kho đến khi nước sánh lại", 600, []],
  ],
  "Canh chua cá": [
    ["Đun sôi nồi nước", 300, []],
    ["Cho dứa và cà chua vào nấu", 180, ["Dứa", "Cà chua"]],
    ["Cho cá vào nấu chín", 420, ["Cá basa"]],
    ["Thêm đậu bắp và giá đỗ, nêm chua ngọt", 120, ["Đậu bắp", "Giá đỗ"]],
  ],
  "Rau muống xào tỏi": [
    ["Nhặt, rửa sạch rau muống, để ráo", null, ["Rau muống"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho rau muống vào xào lửa lớn", 120, []],
    ["Nêm vừa ăn rồi tắt bếp", null, []],
  ],
  "Canh bí đỏ thịt bằm": [
    ["Xào sơ thịt heo xay", 120, ["Thịt heo xay"]],
    ["Đổ nước vào, đun sôi", 300, []],
    ["Cho bí đỏ vào nấu đến khi mềm", 600, ["Bí đỏ"]],
    ["Nêm vừa ăn, rắc hành lá", null, ["Hành lá"]],
  ],
  "Gà kho gừng": [
    ["Chặt gà miếng vừa ăn, ướp với hành tím", 900, ["Thịt gà", "Hành tím"]],
    ["Phi thơm gừng thái sợi", 60, ["Gừng"]],
    ["Cho gà vào xào săn", 300, []],
    ["Thêm chút nước, kho lửa nhỏ đến khi gà thấm", 1200, []],
  ],
  "Đậu phụ sốt cà chua": [
    ["Cắt đậu phụ miếng vuông, chiên vàng các mặt", 480, ["Đậu phụ"]],
    ["Xào cà chua đến khi nhuyễn thành sốt", 240, ["Cà chua"]],
    ["Cho đậu phụ vào sốt, đun liu riu", 300, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Trứng xào cà chua": [
    ["Đánh tan trứng với chút muối", null, ["Trứng gà"]],
    ["Xào cà chua cho mềm", 180, ["Cà chua"]],
    ["Đổ trứng vào, đảo nhẹ đến khi trứng vừa chín", 120, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Bò xào bông cải xanh": [
    ["Thái mỏng thịt bò, ướp gia vị", 600, ["Thịt bò"]],
    ["Chần bông cải xanh và cà rốt", 120, ["Bông cải xanh", "Cà rốt"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho thịt bò vào xào lửa lớn", 120, []],
    ["Cho rau vào đảo đều, nêm vừa ăn", 120, []],
  ],
  "Canh rau ngót thịt bằm": [
    ["Vò nhẹ rau ngót cho mềm", null, ["Rau ngót"]],
    ["Xào sơ thịt heo xay rồi đổ nước, đun sôi", 300, ["Thịt heo xay"]],
    ["Cho rau ngót vào nấu", 180, []],
    ["Nêm vừa ăn rồi tắt bếp", null, []],
  ],
  "Sườn xào chua ngọt": [
    ["Chặt sườn miếng nhỏ, chần qua nước sôi", 180, ["Sườn heo"]],
    ["Chiên sườn vàng các mặt", 600, []],
    ["Xào hành tây, cà chua và dứa", 180, ["Hành tây", "Cà chua", "Dứa"]],
    ["Cho sườn vào, rim lửa nhỏ đến khi sốt sánh", 600, []],
  ],
  "Tôm rim": [
    ["Rửa sạch tôm, cắt râu", null, ["Tôm"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho tôm vào rim lửa vừa", 480, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Cơm chiên dương châu": [
    ["Nấu cơm từ trước, để nguội cho hạt rời", null, ["Gạo"]],
    ["Thái hạt lựu lạp xưởng và cà rốt", null, ["Lạp xưởng", "Cà rốt"]],
    ["Xào lạp xưởng, cà rốt và đậu Hà Lan", 180, ["Đậu Hà Lan"]],
    ["Cho trứng vào đảo nhanh", 60, ["Trứng gà"]],
    ["Cho cơm vào chiên lửa lớn, đảo đều", 300, []],
  ],
  "Bún chả": [
    ["Ướp thịt heo xay và thịt ba chỉ thái lát", 1800, ["Thịt heo xay", "Thịt ba chỉ"]],
    ["Viên chả, nướng thịt đến khi vàng thơm", 900, []],
    ["Pha nước mắm chua ngọt, thả chả vào", null, []],
    ["Bày bún và rau sống ra đĩa", null, ["Bún", "Rau sống"]],
  ],
  "Gỏi cuốn tôm thịt": [
    ["Luộc thịt ba chỉ đến khi chín", 1200, ["Thịt ba chỉ"]],
    ["Luộc tôm, bóc vỏ, chẻ đôi", 180, ["Tôm"]],
    ["Thái mỏng thịt, chuẩn bị bún và xà lách", null, ["Bún", "Xà lách"]],
    ["Nhúng bánh tráng, cuốn tôm, thịt, bún và rau", null, ["Bánh tráng"]],
  ],
  "Mực xào cần tây": [
    ["Làm sạch mực, khứa vảy rồng, cắt miếng", null, ["Mực"]],
    ["Phi hành tây cho thơm", 60, ["Hành tây"]],
    ["Cho mực vào xào lửa lớn", 120, []],
    ["Thêm cần tây, đảo nhanh rồi tắt bếp", 60, ["Cần tây"]],
  ],
  "Canh khổ qua nhồi thịt": [
    ["Ngâm nấm mèo, băm nhỏ, trộn với thịt heo xay", 900, ["Nấm mèo", "Thịt heo xay"]],
    ["Bổ khổ qua, bỏ ruột, nhồi nhân thịt", null, ["Khổ qua"]],
    ["Đun sôi nước, thả khổ qua vào", 300, []],
    ["Hạ lửa nấu đến khi khổ qua mềm", 1200, []],
  ],
};

export type SeedStep = {
  order: number;
  instruction: string;
  durationSeconds: number | null;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
};

/** Steps for a starter dish, with each ingredient's quantity and unit from the dish; null when there are none. */
export function stepsFor(recipe: SeedRecipe): SeedStep[] | null {
  const rows = STEPS[recipe.name];
  if (!rows) return null;
  return rows.map(([instruction, durationSeconds, names], index) => ({
    order: index + 1,
    instruction,
    durationSeconds,
    ingredients: names.map((name) => {
      const ingredient = recipe.ingredients.find((entry) => entry.name === name);
      return { name, quantity: ingredient?.quantity ?? null, unit: ingredient?.unit ?? null };
    }),
  }));
}

/** Dish names that have starter steps (used by tests). */
export const dishesWithSteps = (): string[] => seedRecipes.filter((recipe) => STEPS[recipe.name]).map((recipe) => recipe.name);
export const stepRowsFor = (name: string): StepRow[] | undefined => STEPS[name];
