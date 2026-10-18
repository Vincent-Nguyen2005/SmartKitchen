export type GatewayRoute = {
  prefix: string;
  serviceName: string;
  envKey: string;
  defaultTarget: string;
};

export const gatewayRoutes: GatewayRoute[] = [
  { prefix: "/api/auth", serviceName: "auth-service", envKey: "AUTH_SERVICE_URL", defaultTarget: "http://localhost:4001" },
  { prefix: "/api/families", serviceName: "family-service", envKey: "FAMILY_SERVICE_URL", defaultTarget: "http://localhost:4002" },
  { prefix: "/api/inventory", serviceName: "inventory-service", envKey: "INVENTORY_SERVICE_URL", defaultTarget: "http://localhost:4003" },
  { prefix: "/api/nutrition", serviceName: "nutrition-service", envKey: "NUTRITION_SERVICE_URL", defaultTarget: "http://localhost:4004" },
  { prefix: "/api/meal-diary", serviceName: "meal-diary-service", envKey: "MEAL_DIARY_SERVICE_URL", defaultTarget: "http://localhost:4005" },
  { prefix: "/api/recipes", serviceName: "recipe-service", envKey: "RECIPE_SERVICE_URL", defaultTarget: "http://localhost:4006" },
  { prefix: "/api/menus", serviceName: "menu-service", envKey: "MENU_SERVICE_URL", defaultTarget: "http://localhost:4007" },
  { prefix: "/api/shopping-list", serviceName: "shopping-list-service", envKey: "SHOPPING_LIST_SERVICE_URL", defaultTarget: "http://localhost:4008" },
  { prefix: "/api/payments", serviceName: "payment-service", envKey: "PAYMENT_SERVICE_URL", defaultTarget: "http://localhost:4009" },
  { prefix: "/api/notifications", serviceName: "notification-service", envKey: "NOTIFICATION_SERVICE_URL", defaultTarget: "http://localhost:4010" },
  { prefix: "/api/admin", serviceName: "admin-service", envKey: "ADMIN_SERVICE_URL", defaultTarget: "http://localhost:4011" },
];

export const getTarget = (route: GatewayRoute): string => process.env[route.envKey] || route.defaultTarget;
