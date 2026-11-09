import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import paymentRouter from "./routes/payment.routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/payments", paymentRouter);
app.use("/", paymentRouter);

const PORT = process.env.PORT || 4009;
app.listen(PORT, () => {
  console.log(`[payment-service] dang chay tai http://localhost:${PORT}`);
});
