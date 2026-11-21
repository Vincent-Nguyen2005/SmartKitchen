import dotenv from "dotenv";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { fillMissingRoles, fillMissingSteps, seedMissingRecipes } from "./seed/seed-recipes";

dotenv.config();

const PORT = process.env.PORT || 4006;
createApp().listen(PORT, () => {
  console.log(`[recipe-service] dang chay tai http://localhost:${PORT}`);
});

// Starter Vietnamese dishes: add the ones whose name is missing (new dishes reach older databases too), then
// give starter dishes their cooking steps and meal role where those are still empty. Never overwrites a row.
seedMissingRecipes(prisma)
  .then((created) => { if (created > 0) console.log(`[recipe-service] seeded ${created} starter recipes`); })
  .then(() => fillMissingSteps(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added cooking steps to ${filled} recipes`); })
  .then(() => fillMissingRoles(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added meal roles to ${filled} recipes`); })
  .catch((error: unknown) => console.error("[recipe-service] starter seed failed:", error));
