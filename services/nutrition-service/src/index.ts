import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client-nutrition";
import { createApp } from "./app";
import { seedHealthCatalog } from "./seed/health-catalog";
import { removeEnglishCatalog } from "./seed/english-catalog-cleanup";

dotenv.config();

const PORT = process.env.PORT || 4004;
createApp().listen(PORT, () => {
  console.log(`[nutrition-service] dang chay tai http://localhost:${PORT}`);
});

// Common allergies / health conditions: add the missing names (never updates or deletes existing rows).
const seedClient = new PrismaClient();
seedHealthCatalog(seedClient)
  .then(({ allergies, conditions }) => {
    if (allergies + conditions > 0) console.log(`[nutrition-service] added ${allergies} allergies and ${conditions} health conditions`);
  })
  // Then retire the old English entries, moving users' selections to the Vietnamese ones (idempotent).
  .then(() => removeEnglishCatalog(seedClient))
  .then(({ moved, toCustom, deleted }) => {
    if (deleted > 0) console.log(`[nutrition-service] removed ${deleted} English catalog entries (${moved} selections moved, ${toCustom} kept as custom tags)`);
  })
  .catch((error: unknown) => console.error("[nutrition-service] health catalog seed failed:", error instanceof Error ? error.message : error))
  .finally(() => void seedClient.$disconnect());
