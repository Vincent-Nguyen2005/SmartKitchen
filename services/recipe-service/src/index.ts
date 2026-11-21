import dotenv from "dotenv";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { seedRecipesIfEmpty } from "./seed/seed-recipes";

dotenv.config();

const PORT = process.env.PORT || 4006;
createApp().listen(PORT, () => {
  console.log(`[recipe-service] dang chay tai http://localhost:${PORT}`);
});

// Fresh database: add the starter Vietnamese dishes once. Existing rows are never touched.
seedRecipesIfEmpty(prisma)
  .then((created) => { if (created > 0) console.log(`[recipe-service] seeded ${created} starter recipes`); })
  .catch((error: unknown) => console.error("[recipe-service] starter seed failed:", error));
