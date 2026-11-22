import type { PrismaClient } from ".prisma/client-nutrition";

/**
 * The 11 English catalog entries from the first seed migration (20261104130000_seed_health_catalog) and their
 * Vietnamese equivalents in the current catalog (seed/health-catalog.ts). `to: null` would mean "no equivalent":
 * selections then become the user's custom tags under `customName`.
 */
export const ENGLISH_ALLERGIES: Array<{ from: string; to: string | null; customName: string }> = [
  { from: "Milk", to: "Sữa", customName: "Sữa" },
  { from: "Egg", to: "Trứng", customName: "Trứng" },
  { from: "Peanut", to: "Đậu phộng", customName: "Đậu phộng" },
  { from: "Tree nut", to: "Hạt cây", customName: "Hạt cây" },
  { from: "Soy", to: "Đậu nành", customName: "Đậu nành" },
  { from: "Wheat", to: "Gluten", customName: "Lúa mì" },
  { from: "Fish", to: "Cá", customName: "Cá" },
  { from: "Shellfish", to: "Hải sản", customName: "Hải sản có vỏ" },
  { from: "Sesame", to: "Mè", customName: "Mè" },
];
export const ENGLISH_CONDITIONS: Array<{ from: string; to: string | null; customName: string }> = [
  { from: "Diabetes", to: "Tiểu đường", customName: "Tiểu đường" },
  { from: "Hypertension", to: "Cao huyết áp", customName: "Cao huyết áp" },
];

export type CleanupReport = { moved: number; toCustom: number; deleted: number };

const sameTag = (left: string, right: string) => left.normalize("NFC").trim().toLowerCase() === right.normalize("NFC").trim().toLowerCase();

/** Adds names to a user's custom tags (no duplicates); keeps the other kind as it is. */
async function addCustom(client: PrismaClient, userId: string, kind: "allergies" | "conditions", name: string): Promise<void> {
  const current = await client.userHealthCustom.findUnique({ where: { userId } });
  const list = current?.[kind] ?? [];
  if (list.some((entry) => sameTag(entry, name))) return;
  const next = [...list, name];
  await client.userHealthCustom.upsert({
    where: { userId },
    create: { userId, allergies: kind === "allergies" ? next : [], conditions: kind === "conditions" ? next : [] },
    update: { [kind]: next },
  });
}

/**
 * Removes the old English entries without losing anyone's choices:
 * 1. selections of an English entry move to its Vietnamese equivalent (skipped when the user already has it);
 * 2. without an equivalent they become the user's custom tags;
 * 3. the English entry is deleted.
 * Entries that are already gone are skipped, so running it again changes nothing.
 */
export async function removeEnglishCatalog(client: PrismaClient): Promise<CleanupReport> {
  const report: CleanupReport = { moved: 0, toCustom: 0, deleted: 0 };

  for (const entry of ENGLISH_ALLERGIES) {
    const old = await client.allergy.findUnique({ where: { name: entry.from } });
    if (!old) continue;
    const target = entry.to ? await client.allergy.findUnique({ where: { name: entry.to } }) : null;
    const selections = await client.userAllergy.findMany({ where: { allergyId: old.id } });
    await client.$transaction(async (tx) => {
      const transaction = tx as unknown as PrismaClient;
      if (target) {
        if (selections.length > 0) {
          const result = await transaction.userAllergy.createMany({ data: selections.map(({ userId }) => ({ userId, allergyId: target.id })), skipDuplicates: true });
          report.moved += result.count;
        }
      } else {
        for (const { userId } of selections) await addCustom(transaction, userId, "allergies", entry.customName);
        report.toCustom += selections.length;
      }
      await transaction.userAllergy.deleteMany({ where: { allergyId: old.id } });
      await transaction.allergy.delete({ where: { id: old.id } });
    });
    report.deleted += 1;
  }

  for (const entry of ENGLISH_CONDITIONS) {
    const old = await client.healthCondition.findUnique({ where: { name: entry.from } });
    if (!old) continue;
    const target = entry.to ? await client.healthCondition.findUnique({ where: { name: entry.to } }) : null;
    const selections = await client.userHealthCondition.findMany({ where: { conditionId: old.id } });
    await client.$transaction(async (tx) => {
      const transaction = tx as unknown as PrismaClient;
      if (target) {
        if (selections.length > 0) {
          const result = await transaction.userHealthCondition.createMany({ data: selections.map(({ userId }) => ({ userId, conditionId: target.id })), skipDuplicates: true });
          report.moved += result.count;
        }
      } else {
        for (const { userId } of selections) await addCustom(transaction, userId, "conditions", entry.customName);
        report.toCustom += selections.length;
      }
      await transaction.userHealthCondition.deleteMany({ where: { conditionId: old.id } });
      await transaction.healthCondition.delete({ where: { id: old.id } });
    });
    report.deleted += 1;
  }
  return report;
}
