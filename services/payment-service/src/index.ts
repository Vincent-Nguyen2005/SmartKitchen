import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

// TODO: mount cac route nghiep vu cua payment-service tai day
// app.use("/api/payment", mainRouter);

const PORT = process.env.PORT || 4009;
app.listen(PORT, () => {
  console.log(`[payment-service] dang chay tai http://localhost:${PORT}`);
});
