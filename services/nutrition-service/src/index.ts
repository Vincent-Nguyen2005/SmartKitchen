import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import nutritionProfileRouter from "./routes/nutrition-profile.route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/nutrition-profile", nutritionProfileRouter);

const PORT = process.env.PORT || 4004;
app.listen(PORT, () => {
  console.log(`[nutrition-service] dang chay tai http://localhost:${PORT}`);
});
