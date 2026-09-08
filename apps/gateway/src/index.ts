import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";

dotenv.config();

const app = express();
app.use(cors());

// ------------------------------------------------------------
// Dinh tuyen request tu Frontend toi tung service tuong ung
// Vi du: /api/auth/*      -> AUTH_SERVICE_URL
//        /api/inventory/* -> INVENTORY_SERVICE_URL
// ------------------------------------------------------------
app.use(
  "/api/auth",
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/auth": "/api/auth" },
  })
);
app.use(
  "/api/family",
  createProxyMiddleware({
    target: process.env.FAMILY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/family": "/api/family" },
  })
);
app.use(
  "/api/inventory",
  createProxyMiddleware({
    target: process.env.INVENTORY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/inventory": "/api/inventory" },
  })
);
app.use(
  "/api/nutrition",
  createProxyMiddleware({
    target: process.env.NUTRITION_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/nutrition": "/api/nutrition" },
  })
);
app.use(
  "/api/meal-diary",
  createProxyMiddleware({
    target: process.env.MEAL_DIARY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/meal-diary": "/api/meal-diary" },
  })
);
app.use(
  "/api/recipe",
  createProxyMiddleware({
    target: process.env.RECIPE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/recipe": "/api/recipe" },
  })
);
app.use(
  "/api/menu",
  createProxyMiddleware({
    target: process.env.MENU_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/menu": "/api/menu" },
  })
);
app.use(
  "/api/shopping-list",
  createProxyMiddleware({
    target: process.env.SHOPPING_LIST_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/shopping-list": "/api/shopping-list" },
  })
);
app.use(
  "/api/payment",
  createProxyMiddleware({
    target: process.env.PAYMENT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/payment": "/api/payment" },
  })
);
app.use(
  "/api/notification",
  createProxyMiddleware({
    target: process.env.NOTIFICATION_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/notification": "/api/notification" },
  })
);
app.use(
  "/api/admin",
  createProxyMiddleware({
    target: process.env.ADMIN_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/admin": "/api/admin" },
  })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[gateway] dang chay tai http://localhost:${PORT}`);
});
