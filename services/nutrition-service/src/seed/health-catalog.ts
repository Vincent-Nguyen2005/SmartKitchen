import type { PrismaClient } from ".prisma/client-nutrition";

type CatalogItem = { name: string; description: string };

/**
 * Common allergies. Names match the allergen tags used on recipes (recipe-service seed: "sữa", "trứng", "cá",
 * "hải sản", "đậu nành", "gluten"); the suggestion filter compares names without accents and case.
 */
export const ALLERGY_CATALOG: CatalogItem[] = [
  { name: "Đậu phộng", description: "Đậu phộng (lạc) và sản phẩm từ đậu phộng" },
  { name: "Hạt cây", description: "Hạnh nhân, óc chó, hạt điều, hạt dẻ cười" },
  { name: "Sữa", description: "Sữa bò và các sản phẩm từ sữa" },
  { name: "Lactose", description: "Không dung nạp đường sữa" },
  { name: "Trứng", description: "Trứng và món có trứng" },
  { name: "Cá", description: "Các loại cá và nước mắm cá" },
  { name: "Tôm", description: "Tôm và sản phẩm từ tôm" },
  { name: "Cua", description: "Cua, ghẹ" },
  { name: "Hải sản", description: "Hải sản có vỏ: tôm, cua, sò, nghêu, hàu" },
  { name: "Mực", description: "Mực, bạch tuộc" },
  { name: "Đậu nành", description: "Đậu nành, đậu phụ, sữa đậu nành" },
  { name: "Gluten", description: "Lúa mì, lúa mạch (bánh mì, mì, bún có bột mì)" },
  { name: "Mè", description: "Mè (vừng) và dầu mè" },
  { name: "Ngô", description: "Ngô (bắp) và bột ngô" },
  { name: "Dâu tây", description: "Dâu tây và sản phẩm từ dâu" },
];

/** Common health conditions. Names match the contraindication tags on recipes ("tiểu đường", "cao huyết áp", ...). */
export const CONDITION_CATALOG: CatalogItem[] = [
  { name: "Tiểu đường", description: "Hạn chế đường và tinh bột nhanh" },
  { name: "Cao huyết áp", description: "Hạn chế muối" },
  { name: "Mỡ máu cao", description: "Hạn chế chất béo bão hòa" },
  { name: "Gout", description: "Hạn chế đạm nhân purin (nội tạng, hải sản, thịt đỏ)" },
  { name: "Bệnh thận", description: "Hạn chế muối, đạm và kali" },
  { name: "Bệnh dạ dày", description: "Tránh món cay, chua, nhiều dầu mỡ" },
  { name: "Thiếu máu", description: "Cần thực phẩm giàu sắt" },
  { name: "Béo phì", description: "Kiểm soát năng lượng" },
  { name: "Mang thai", description: "Tránh đồ sống, tái và một số loại cá" },
  { name: "Cho con bú", description: "Cần thêm năng lượng và nước" },
  { name: "Bệnh tim mạch", description: "Hạn chế muối và chất béo" },
  { name: "Gan nhiễm mỡ", description: "Hạn chế đường, rượu bia và dầu mỡ" },
];

/**
 * Adds the catalog items whose name is missing (createMany + skipDuplicates on the unique name). Never updates or
 * deletes existing rows (older English entries stay); running it again adds nothing. Returns how many were added.
 */
export async function seedHealthCatalog(client: PrismaClient): Promise<{ allergies: number; conditions: number }> {
  const [allergies, conditions] = await Promise.all([
    client.allergy.createMany({ data: ALLERGY_CATALOG, skipDuplicates: true }),
    client.healthCondition.createMany({ data: CONDITION_CATALOG, skipDuplicates: true }),
  ]);
  return { allergies: allergies.count, conditions: conditions.count };
}
