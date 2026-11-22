import dotenv from "dotenv";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { fillMissingRoles, fillMissingSteps, fillSeasonings, seedMissingRecipes } from "./seed/seed-recipes";
import { fillHealthTags } from "./seed/health-tags";
import { fillPerPerson } from "./seed/per-person";

dotenv.config();

const PORT = process.env.PORT || 4006;
createApp().listen(PORT, () => {
  console.log(`[recipe-service] dang chay tai http://localhost:${PORT}`);
});

// Starter Vietnamese dishes: add the ones whose name is missing (new dishes reach older databases too), then
// give starter dishes their cooking steps, meal role, seasonings and health tags (allergens / contraindications)
// where those are still empty. Never overwrites a filled field.
seedMissingRecipes(prisma)
  .then((created) => { if (created > 0) console.log(`[recipe-service] seeded ${created} starter recipes`); })
  .then(() => fillMissingSteps(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added cooking steps to ${filled} recipes`); })
  .then(() => fillMissingRoles(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added meal roles to ${filled} recipes`); })
  .then(() => fillSeasonings(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added seasonings to ${filled} recipes`); })
  .then(() => fillHealthTags(prisma))
  .then((filled) => { if (filled.length > 0) console.log(`[recipe-service] added health tags to ${filled.length} recipes`); })
  .then(() => fillPerPerson(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] marked per-person ingredients in ${filled} recipes`); })
  .catch((error: unknown) => console.error("[recipe-service] starter seed failed:", error));
