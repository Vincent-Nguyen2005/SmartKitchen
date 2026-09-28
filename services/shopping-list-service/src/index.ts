import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

// TODO: mount cac route nghiep vu cua shopping-list-service tai day
// app.use("/api/shopping-list", mainRouter);

const PORT = process.env.PORT || 4008;
app.listen(PORT, () => {
  console.log(`[shopping-list-service] dang chay tai http://localhost:${PORT}`);
});
