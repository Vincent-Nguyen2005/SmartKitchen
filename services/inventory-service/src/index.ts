import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import itemsRouter from "./routes/items.route";
import { errorHandler } from "./middleware/error.middleware";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/inventory/items", itemsRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4003;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[inventory-service] dang chay tai http://0.0.0.0:${PORT}`);
});
