import cors from "cors";
import compression from "compression";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
import { createProxyMiddleware } from "http-proxy-middleware";
import { gatewayRoutes, getTarget } from "./config/routes";
import { performanceConfig } from "./config/performance";
import { responseCache } from "./middleware/cache";
import { createAuthRateLimiter, createGlobalRateLimiter } from "./middleware/rate-limit";

const serviceHealthTimeoutMs = 2000;

type ServiceStatus = "UP" | "DOWN";

type ProxyResponse = Response & { statusCode?: number };

const requestId = (req: Request, res: Response, next: () => void): void => {
  const id = req.header("x-request-id") || randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  next();
};

const authenticate = (_req: Request, _res: Response, next: () => void): void => {
  // TODO: wire JWT verification when the Auth Service contract is ready.
  next();
};

const serviceHealth = async (route: (typeof gatewayRoutes)[number]): Promise<ServiceStatus> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), serviceHealthTimeoutMs);
  try {
    const response = await fetch(`${getTarget(route)}/health`, { signal: controller.signal });
    return response.ok ? "UP" : "DOWN";
  } catch {
    return "DOWN";
  } finally {
    clearTimeout(timeout);
  }
};

export const createApp = (): express.Express => {
  const app = express();
  app.set("trust proxy", performanceConfig.trustProxy);
  const origins = (process.env.CORS_ORIGINS || "*").split(",").map((origin) => origin.trim());

  app.use(helmet());
  app.use(cors({ origin: origins.includes("*") ? true : origins }));
  app.use(requestId);
  app.use(morgan("combined"));
  app.use(compression());

  app.get("/health", (_req, res) => {
    res.json({ status: "OK", service: "gateway", timestamp: new Date().toISOString() });
  });

  app.get("/api/health", async (_req, res) => {
    const statuses = await Promise.all(gatewayRoutes.map(async (route) => [route.serviceName, await serviceHealth(route)] as const));
    const services = Object.fromEntries(statuses);
    const allUp = Object.values(services).every((status) => status === "UP");
    res.status(allUp ? 200 : 503).json({
      status: allUp ? "OK" : "DEGRADED",
      gateway: "OK",
      services,
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", createGlobalRateLimiter());
  app.use("/api/auth", createAuthRateLimiter());
  app.use((req, _res, next) => {
    delete req.headers["x-user-id"];
    delete req.headers["x-user-role"];
    next();
  });
  app.use(authenticate);
  app.use(responseCache);
  for (const route of gatewayRoutes) {
    app.use(route.prefix, createProxyMiddleware({
      target: getTarget(route),
      changeOrigin: true,
      on: {
        error: (_error, _request, response) => {
          const proxyResponse = response as ProxyResponse;
          if (!proxyResponse.headersSent) {
            proxyResponse.status(503).json({ error: "SERVICE_UNAVAILABLE", service: route.serviceName });
          }
        },
      },
    }));
  }

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "ROUTE_NOT_FOUND", path: req.originalUrl });
  });

  return app;
};
