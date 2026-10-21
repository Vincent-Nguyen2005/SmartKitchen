import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Đang xóa dữ liệu cũ...");
  await prisma.foodItem.deleteMany({});

  const familyId = "11111111-1111-1111-1111-111111111111";

  console.log("🌱 Đang bơm dữ liệu mẫu...");

  const items = [
    {
      familyId,
      name: "Gạo",
      quantity: 5,
      unit: "KILOGRAM" as const,
      storageLocation: "PANTRY" as const,
    },
    {
      familyId,
      name: "Sữa tươi",
      quantity: 2,
      unit: "BOTTLE" as const,
      storageLocation: "FRIDGE" as const,
      expiryDate: new Date("2026-10-25"),
    },
    {
      familyId,
      name: "Trứng gà",
      quantity: 10,
      unit: "PIECE" as const,
      storageLocation: "FRIDGE" as const,
    },
    {
      familyId,
      name: "Thịt heo",
      quantity: 1,
      unit: "KILOGRAM" as const,
      storageLocation: "FREEZER" as const,
    },
    {
      familyId,
      name: "Rau cải",
      quantity: 1,
      unit: "PACK" as const,
      storageLocation: "FRIDGE" as const,
      expiryDate: new Date("2026-10-22"),
    },
    {
      familyId,
      name: "Nước mắm",
      quantity: 2,
      unit: "BOTTLE" as const,
      storageLocation: "PANTRY" as const,
    },
    {
      familyId,
      name: "Cà chua",
      quantity: 500,
      unit: "GRAM" as const,
      storageLocation: "FRIDGE" as const,
    },
    {
      familyId,
      name: "Dầu ăn",
      quantity: 1,
      unit: "BOTTLE" as const,
      storageLocation: "PANTRY" as const,
    },
    {
      familyId,
      name: "Muối",
      quantity: 1,
      unit: "PACK" as const,
      storageLocation: "PANTRY" as const,
    },
    {
      familyId,
      name: "Đường",
      quantity: 500,
      unit: "GRAM" as const,
      storageLocation: "PANTRY" as const,
    },
  ];

  for (const item of items) {
    await prisma.foodItem.create({ data: item });
    console.log(`  ✅ Đã thêm: ${item.name}`);
  }
  console.log(`\n🎉 Đã bơm thành công ${items.length} nguyên liệu!`);
}

main()
  .catch((e) => {
    console.error(e);
    // Thay process.exit(1) thành:
    throw e;
  })
  .finally(() => prisma.$disconnect());
