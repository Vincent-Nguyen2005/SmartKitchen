import { PrismaClient } from "../../node_modules/.prisma/client-admin";
import { catalogSeed } from "../seed/catalog.data";
import { findImage, searchCommons } from "./commons-images";

/** At most one Commons request every 1.5 s (Wikimedia asks API clients to go slowly). */
const PACE_MS = 1500;
let lastRequest = 0;
async function pacedSearch(term: string) {
  const wait = lastRequest + PACE_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  return searchCommons(term);
}

/**
 * Fills missing catalog images from Wikimedia Commons (reusable licenses only) with their credit.
 *
 *   node dist/scripts/fill-catalog-images.js [--dry-run] [--limit N] [--skip "Tên 1,Tên 2"]
 *
 * --skip: names to leave empty (e.g. matches found wrong when reviewing a dry run); they are listed as "skipped".
 *
 * Only rows WITHOUT an image are looked at; the update also requires the image to be still empty, so an image an
 * admin set (even meanwhile) is never overwritten. No confident match: the row stays empty and is listed.
 * Root wrappers: scripts/fill-catalog-images.sh / .ps1 run this inside the admin-service container.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Math.max(1, Number(args[limitAt + 1]) || 0) : Number.POSITIVE_INFINITY;
  const skipAt = args.indexOf("--skip");
  const key = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("vi");
  const skip = new Set(skipAt >= 0 ? (args[skipAt + 1] ?? "").split(",").map(key).filter(Boolean) : []);
  const english = new Map(catalogSeed.map((entry) => [entry.name.normalize("NFC").toLocaleLowerCase("vi"), entry.en]));

  const prisma = new PrismaClient();
  try {
    const rows = (await prisma.masterIngredient.findMany({
      where: { OR: [{ imageUrl: null }, { imageUrl: "" }] },
      select: { id: true, name: true },
      orderBy: { nameNormalized: "asc" },
    })).slice(0, limit);
    const matched: string[] = [];
    const unmatched: string[] = [];
    const skipped: string[] = [];
    for (const row of rows) {
      if (skip.has(key(row.name))) {
        skipped.push(row.name);
        continue;
      }
      const en = english.get(row.name.normalize("NFC").toLocaleLowerCase("vi"));
      let image = null;
      try {
        image = await findImage({ vi: row.name, en }, pacedSearch);
      } catch (error) {
        console.log(`  ! ${row.name}: search failed (${error instanceof Error ? error.message : "error"})`);
      }
      if (!image) {
        unmatched.push(row.name);
        continue;
      }
      if (!dryRun) {
        const updated = await prisma.masterIngredient.updateMany({
          where: { id: row.id, OR: [{ imageUrl: null }, { imageUrl: "" }] },
          data: { imageUrl: image.imageUrl, imageSource: image.imageSource, imageAuthor: image.imageAuthor, imageLicense: image.imageLicense },
        });
        if (updated.count === 0) continue;
      }
      matched.push(row.name);
      console.log(`  ${dryRun ? "would set" : "set"} ${row.name}: ${image.title} (${image.imageLicense})`);
    }
    console.log(`${dryRun ? "[dry run] " : ""}checked ${rows.length}, ${dryRun ? "would get" : "got"} images: ${matched.length}, no confident match: ${unmatched.length}, skipped: ${skipped.length}`);
    if (unmatched.length > 0) console.log(`no match: ${unmatched.join(", ")}`);
    if (skipped.length > 0) console.log(`skipped (--skip): ${skipped.join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error("fill-catalog-images failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
