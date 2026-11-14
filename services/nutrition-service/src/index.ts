import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

const PORT = process.env.PORT || 4004;
createApp().listen(PORT, () => {
  console.log(`[nutrition-service] dang chay tai http://localhost:${PORT}`);
});
