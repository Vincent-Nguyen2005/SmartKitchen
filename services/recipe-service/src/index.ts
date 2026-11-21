import dotenv from "dotenv";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { fillMissingSteps, seedRecipesIfEmpty } from "./seed/seed-recipes";

dotenv.config();

const PORT = process.env.PORT || 4006;
createApp().listen(PORT, () => {
  console.log(`[recipe-service] dang chay tai http://localhost:${PORT}`);
});

// Fresh database: add the starter Vietnamese dishes once (with steps). Then give starter dishes that have no
// steps yet their cooking steps (older databases). Existing rows and admin-written steps are never overwritten.
seedRecipesIfEmpty(prisma)
  .then((created) => { if (created > 0) console.log(`[recipe-service] seeded ${created} starter recipes`); })
  .then(() => fillMissingSteps(prisma))
  .then((filled) => { if (filled > 0) console.log(`[recipe-service] added cooking steps to ${filled} recipes`); })
  .catch((error: unknown) => console.error("[recipe-service] starter seed failed:", error));
