import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

const PORT = process.env.PORT || 4005;
createApp().listen(PORT, () => {
  console.log(`[meal-diary-service] dang chay tai http://localhost:${PORT}`);
});
