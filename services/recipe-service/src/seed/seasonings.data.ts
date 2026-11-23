import { seedRole, type SeedRecipe } from "./recipes.data";

/** A seasoning line: free-text home-cooking amount (no Kho unit), always flagged isSeasoning. */
export type SeasoningLine = { name: string; quantity: null; unit: null; note: string; isSeasoning: true };

const line = (name: string, note: string): SeasoningLine => ({ name, quantity: null, unit: null, note, isSeasoning: true });

/** By dish role (Vietnamese home cooking). Small amounts of tỏi / hành tím / ớt count as seasonings. */
const BY_ROLE: Record<string, SeasoningLine[]> = {
  man: [line("Nước mắm", "2 muỗng canh"), line("Đường", "1 muỗng canh"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "2 muỗng canh"), line("Hạt nêm", "vừa ăn")],
  xao: [line("Dầu ăn", "2 muỗng canh"), line("Nước mắm", "1 muỗng canh"), line("Hạt nêm", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  canh: [line("Muối", "1/2 muỗng cà phê"), line("Hạt nêm", "1 muỗng cà phê"), line("Nước mắm", "1 muỗng canh"), line("Tiêu", "vừa ăn")],
  rau: [line("Muối", "1/2 muỗng cà phê"), line("Nước mắm", "vừa ăn")],
  mot_mon: [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn")],
  sang: [line("Muối", "1/2 muỗng cà phê"), line("Hạt nêm", "1 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  trang_mieng: [],
  do_uong: [],
};

/** Dishes whose seasoning differs from their role's template. */
const BY_NAME: Record<string, SeasoningLine[]> = {
  "Canh chua cá": [line("Muối", "1/2 muỗng cà phê"), line("Đường", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Me chua", "1 muỗng canh"), line("Ớt", "vừa ăn")],
  "Sườn xào chua ngọt": [line("Nước mắm", "1 muỗng canh"), line("Đường", "2 muỗng canh"), line("Giấm", "1 muỗng canh"), line("Tương cà", "2 muỗng canh"), line("Dầu ăn", "3 muỗng canh"), line("Tỏi", "1 muỗng cà phê")],
  "Bún chả": [line("Nước mắm", "3 muỗng canh"), line("Đường", "2 muỗng canh"), line("Giấm", "2 muỗng canh"), line("Tiêu", "1/2 muỗng cà phê"), line("Tỏi", "1 muỗng cà phê"), line("Ớt", "vừa ăn")],
  "Gỏi cuốn tôm thịt": [line("Nước tương", "2 muỗng canh"), line("Đường", "1 muỗng canh"), line("Tỏi", "1/2 muỗng cà phê"), line("Ớt", "vừa ăn")],
  "Cơm chiên dương châu": [line("Dầu ăn", "2 muỗng canh"), line("Nước tương", "1 muỗng canh"), line("Hạt nêm", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Xôi đậu xanh": [line("Muối", "1/2 muỗng cà phê"), line("Đường", "1 muỗng canh"), line("Dầu ăn", "2 muỗng canh")],
  "Xôi gà": [line("Muối", "1/2 muỗng cà phê"), line("Nước mắm", "1 muỗng canh"), line("Dầu ăn", "2 muỗng canh"), line("Tiêu", "vừa ăn")],
  "Bánh mì trứng ốp la": [line("Dầu ăn", "1 muỗng canh"), line("Tiêu", "vừa ăn"), line("Nước tương", "vừa ăn")],
  "Bánh mì chảo": [line("Dầu ăn", "1 muỗng canh"), line("Tiêu", "vừa ăn"), line("Nước tương", "vừa ăn")],
  "Mì xào trứng": [line("Dầu ăn", "1 muỗng canh"), line("Nước tương", "1 muỗng canh"), line("Tiêu", "vừa ăn")],
  "Cháo yến mạch chuối sữa": [line("Đường", "1 muỗng cà phê")],
  "Thịt ba chỉ luộc": [line("Muối", "1/2 muỗng cà phê"), line("Nước mắm", "2 muỗng canh"), line("Tỏi", "1 muỗng cà phê"), line("Ớt", "vừa ăn")],
  "Cá chiên giòn": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "1/2 chén")],
  "Tôm rim": [line("Nước mắm", "2 muỗng canh"), line("Đường", "1 muỗng canh"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "1 muỗng canh")],
  "Rau muống xào tỏi": [line("Dầu ăn", "2 muỗng canh"), line("Hạt nêm", "1/2 muỗng cà phê"), line("Nước mắm", "1 muỗng cà phê")],
  "Chè đậu xanh": [line("Đường", "4 muỗng canh"), line("Muối", "1 nhúm")],
  "Sữa đậu nành": [line("Đường", "vừa ăn")],
  "Nước cam": [line("Đường", "vừa ăn")],
  "Sinh tố chuối": [line("Đường", "vừa ăn")],
  // Recipe review corrections (spices, broth seasoning, oil the steps use).
  "Phở bò": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Hoa hồi", "3 cánh"), line("Quế", "1 thanh nhỏ")],
  "Hủ tiếu Nam Vang": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Tỏi phi", "1 muỗng canh")],
  "Bún bò Huế": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Mắm ruốc", "1 muỗng canh")],
  "Bún riêu cua": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Dầu ăn", "2 muỗng canh")],
  "Bò kho": [line("Nước mắm", "2 muỗng canh"), line("Đường", "1 muỗng canh"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "2 muỗng canh"), line("Hạt nêm", "vừa ăn"), line("Ngũ vị hương", "1/2 muỗng cà phê"), line("Dầu điều", "1 muỗng canh")],
  "Canh trứng cà chua": [line("Muối", "1/2 muỗng cà phê"), line("Hạt nêm", "1 muỗng cà phê"), line("Nước mắm", "1 muỗng canh"), line("Tiêu", "vừa ăn"), line("Dầu ăn", "1 muỗng canh")],
  "Trứng xào cà chua": [line("Nước mắm", "1 muỗng canh"), line("Đường", "1 muỗng cà phê"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "2 muỗng canh"), line("Hạt nêm", "vừa ăn")],
  // New dishes.
  "Dưa leo chấm muối": [line("Muối", "1 muỗng cà phê"), line("Ớt", "vừa ăn"), line("Chanh", "1/2 quả")],
  "Nước chanh": [line("Đường", "2 muỗng canh")],
  "Bánh canh cua": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Dầu điều", "1 muỗng canh")],
  "Mì Quảng": [line("Muối", "1 muỗng cà phê"), line("Hạt nêm", "1 muỗng canh"), line("Nước mắm", "2 muỗng canh"), line("Tiêu", "vừa ăn"), line("Ớt", "vừa ăn"), line("Dầu điều", "1 muỗng canh")],
  // Foreign dishes (no fish sauce by default).
  "Mì Ý sốt bò bằm": [line("Dầu ăn", "2 muỗng canh"), line("Muối", "1/2 muỗng cà phê"), line("Đường", "1 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Cà ri gà kiểu Nhật": [line("Muối", "1/2 muỗng cà phê"), line("Đường", "1 muỗng cà phê"), line("Tiêu", "vừa ăn"), line("Dầu ăn", "1 muỗng canh")],
  "Kimbap": [line("Dầu mè", "1 muỗng canh"), line("Muối", "1/2 muỗng cà phê"), line("Dầu ăn", "1 muỗng cà phê")],
  "Cá hồi áp chảo": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn"), line("Dầu ăn", "1 muỗng canh")],
  "Súp bí đỏ kem": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Salad trộn dầu giấm": [line("Dầu ô liu", "2 muỗng canh"), line("Giấm", "1 muỗng canh"), line("Đường", "1 muỗng cà phê"), line("Muối", "1/4 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Trứng cuộn kiểu Hàn": [line("Muối", "1/2 muỗng cà phê"), line("Dầu ăn", "1 muỗng canh")],
  "Bánh mì sandwich trứng": [line("Dầu ăn", "1 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Gà sốt cay kiểu Hàn": [line("Dầu ăn", "2 muỗng canh"), line("Đường", "1 muỗng canh"), line("Nước tương", "1 muỗng canh"), line("Muối", "1/2 muỗng cà phê")],
  "Canh kim chi đậu phụ": [line("Muối", "1/2 muỗng cà phê"), line("Nước tương", "1 muỗng canh"), line("Dầu ăn", "1 muỗng cà phê")],
  "Cơm chiên kim chi": [line("Dầu ăn", "2 muỗng canh"), line("Nước tương", "1 muỗng canh"), line("Đường", "1 muỗng cà phê"), line("Dầu mè", "1 muỗng cà phê")],
  "Bò bít tết": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "1/2 muỗng cà phê"), line("Dầu ăn", "1 muỗng canh")],
  "Khoai tây nghiền": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Súp nấm kem": [line("Muối", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn")],
  "Bánh cuốn": [line("Nước mắm", "3 muỗng canh"), line("Đường", "2 muỗng canh"), line("Hạt nêm", "1/2 muỗng cà phê"), line("Tiêu", "vừa ăn"), line("Dầu ăn", "1 muỗng canh")],
};

const key = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("vi");

/** Seasoning lines for a starter dish, without names the dish already lists as ingredients. */
export function seasoningsFor(recipe: SeedRecipe): SeasoningLine[] {
  const lines = BY_NAME[recipe.name] ?? BY_ROLE[seedRole(recipe) ?? ""] ?? [];
  const existing = new Set(recipe.ingredients.map((ingredient) => key(ingredient.name)));
  return lines.filter((entry) => !existing.has(key(entry.name)));
}

/** "Nêm 1 muỗng canh nước mắm, 1/2 muỗng cà phê hạt nêm" text for a step that already says "nêm". */
export function seasoningText(lines: SeasoningLine[]): string {
  const used = lines.filter((entry) => !["Dầu ăn", "Tỏi", "Ớt"].includes(entry.name));
  return used.map((entry) => `${entry.note} ${entry.name.toLocaleLowerCase("vi")}`).join(", ");
}
