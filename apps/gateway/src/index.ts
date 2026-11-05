import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error(JSON.stringify({ event: "jwt_secret_missing", message: "JWT_SECRET is not set; every Bearer token will be rejected" }));
}

const port = Number(process.env.PORT || 4000);
const app = createApp();
const server = app.listen(port, () => {
  console.log(`[gateway] dang chay tai http://localhost:${port}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
