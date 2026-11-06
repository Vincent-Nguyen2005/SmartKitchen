import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import mealDiaryRouter from "./controllers/meal-diary.controller";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/meal-diary", mealDiaryRouter);

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => {
  console.log(`[meal-diary-service] dang chay tai http://localhost:${PORT}`);
});
