import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import menuRouter from "./routes/menu.route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/menu", menuRouter);
app.use("/api/menus", menuRouter);
app.use("/", menuRouter);

const PORT = process.env.PORT || 4007;
app.listen(PORT, () => {
  console.log(`[menu-service] dang chay tai http://localhost:${PORT}`);
});
