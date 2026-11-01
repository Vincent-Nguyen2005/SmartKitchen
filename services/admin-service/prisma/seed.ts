import { PrismaClient } from "../node_modules/.prisma/client-admin";

const prisma = new PrismaClient();
const ingredients = ["Gạo", "Thịt heo", "Thịt bò", "Thịt gà", "Cá basa", "Tôm", "Trứng gà", "Đậu phụ", "Sữa tươi", "Sữa chua", "Cà chua", "Khoai tây", "Cà rốt", "Bông cải xanh", "Rau muống", "Cải thìa", "Bắp cải", "Dưa leo", "Hành tây", "Tỏi", "Gừng", "Nấm rơm", "Đậu que", "Bí đỏ", "Chuối", "Táo", "Cam", "Thanh long", "Đậu xanh", "Lạc"].map((name) => ({ name, category: "common", defaultUnit: "g", shelfLifeDays: 7, caloriesPer100g: 50, proteinPer100g: 3, carbsPer100g: 8, fatPer100g: 1, allergenTags: [] as string[] }));
const weights = [{ key: "expiry_priority", value: 0.35 }, { key: "nutrition_fit", value: 0.35 }, { key: "preference_match", value: 0.3 }];

async function main(): Promise<void> {
  for (const ingredient of ingredients) await prisma.masterIngredient.upsert({ where: { name: ingredient.name }, update: ingredient, create: { ...ingredient, nameNormalized: ingredient.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() } });
  for (const weight of weights) await prisma.recommendationWeight.upsert({ where: { key: weight.key }, update: {}, create: { ...weight, updatedBy: "seed" } });
}
main().finally(() => prisma.$disconnect());
