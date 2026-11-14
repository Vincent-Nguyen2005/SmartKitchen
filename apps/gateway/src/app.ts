import cors from "cors";
import compression from "compression";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { gatewayRoutes, getTarget } from "./config/routes";
import { performanceConfig } from "./config/performance";
import { responseCache } from "./middleware/cache";
import { createAuthRateLimiter, createGlobalRateLimiter } from "./middleware/rate-limit";
import { createAuthenticate, resolveJwtSecret } from "./middleware/authenticate";

const serviceHealthTimeoutMs = 2000;

const isLocalExpoOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      Number(url.port) >= 8081;
  } catch {
    return false;
  }
};

type ServiceStatus = "UP" | "DOWN";

type ProxyResponse = Response & { statusCode?: number };

const requestId = (req: Request, res: Response, next: () => void): void => {
  const id = req.header("x-request-id") || randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  next();
};

export class MalformedPathError extends Error {
  constructor() {
    super("Malformed percent-encoding in request path");
    this.name = "MalformedPathError";
  }
}

// Double/triple-encoded segments (%252F) are decoded too; anything deeper stays literal.
const MAX_DECODE_PASSES = 3;

/**
 * Canonical form of a request path, used only for access checks (the proxied URL is untouched):
 * percent-decoded, backslashes -> "/", dot segments resolved, repeated slashes collapsed, lowercased.
 * Throws MalformedPathError on invalid percent-encoding (e.g. "%zz").
 */
export const normalizeRequestPath = (rawPath: string): string => {
  let decoded = rawPath;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new MalformedPathError();
    }
    if (next === decoded) break;
    decoded = next;
  }
  return posix.normalize(decoded.replace(/\\/g, "/")).replace(/\/+/g, "/").toLowerCase();
};

const INTERNAL_PATH = /^\/(?:api\/)?internal(?:\/|$)|^\/api\/[^/]+\/internal(?:\/|$)/;

const pathOnly = (url: string): string => url.split("?")[0];

// Service-to-service endpoints (e.g. notification-service /internal/*) are never exposed publicly.
// Fails closed: a path that cannot be decoded counts as internal.
export const isInternalPath = (path: string): boolean => {
  try {
    return INTERNAL_PATH.test(normalizeRequestPath(path));
  } catch {
    return true;
  }
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

const createServiceProxy = (route: (typeof gatewayRoutes)[number]) => createProxyMiddleware({
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
});

type AppOptions = { jwtSecret?: string | null };

export const createApp = (options: AppOptions = {}): express.Express => {
  const app = express();
  const jwtSecret = options.jwtSecret === undefined ? resolveJwtSecret() : options.jwtSecret;
  app.set("trust proxy", performanceConfig.trustProxy);
  const origins = (process.env.CORS_ORIGINS || "*").split(",").map((origin) => origin.trim());
  const isAllowedOrigin = (origin: string): boolean =>
    origins.includes("*") || origins.includes(origin) || isLocalExpoOrigin(origin);

  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin && !isAllowedOrigin(origin)) {
      res.status(403).json({ error: "CORS_ORIGIN_DENIED", message: "Origin not allowed" });
      return;
    }
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, Boolean(origin && isAllowedOrigin(origin)));
    },
    optionsSuccessStatus: 204,
  }));
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
  // Runs before authentication so anonymous probes are blocked too. Uses the raw URL, not req.path,
  // so encoded / dot-segment / backslash variants are normalized here rather than by Express.
  app.use((req, res, next) => {
    let path: string;
    try {
      path = normalizeRequestPath(pathOnly(req.originalUrl));
    } catch {
      res.status(400).json({ error: "BAD_REQUEST", message: "Malformed URL encoding" });
      return;
    }
    if (INTERNAL_PATH.test(path)) { res.status(404).json({ error: "ROUTE_NOT_FOUND", path: req.originalUrl }); return; }
    // Service API keys (partner ingestion, internal calls) are never accepted from public clients:
    // strip a client-sent x-api-key on every proxied route, not only /api/admin.
    delete req.headers["x-api-key"];
    next();
  });
  // Strips client-supplied x-user-id/x-user-role, then sets them only from a verified access token.
  app.use(createAuthenticate(jwtSecret));
  app.use(responseCache);
  for (const route of gatewayRoutes) {
    app.use(route.prefix, createServiceProxy(route));
  }
  const menuRoute = gatewayRoutes.find((route) => route.prefix === "/api/menus");
  if (menuRoute) {
    app.use("/api/menu", createServiceProxy(menuRoute));
  }

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "ROUTE_NOT_FOUND", path: req.originalUrl });
  });

  return app;
};
