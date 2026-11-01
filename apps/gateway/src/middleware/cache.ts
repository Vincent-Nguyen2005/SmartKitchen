import type { NextFunction, Request, Response } from "express";
import { LRUCache } from "lru-cache";
import { performanceConfig, isCacheableRoute } from "../config/performance";

type CachedResponse = { body: Buffer; statusCode: number; contentType?: string };

const cache = new LRUCache<string, CachedResponse>({
  max: performanceConfig.cacheMaxItems,
  ttl: performanceConfig.cacheTtlMs,
});

const cacheKey = (request: Request): string => {
  const url = new URL(request.originalUrl, "http://gateway");
  url.searchParams.sort();
  return `${request.method}:${url.pathname}?${url.searchParams.toString()}`;
};

export const responseCache = (request: Request, response: Response, next: NextFunction): void => {
  const bypass = request.method !== "GET" || !isCacheableRoute(request.originalUrl) ||
    Boolean(request.header("authorization")) || Boolean(request.header("cookie")) ||
    request.header("cache-control")?.toLowerCase().includes("no-cache");

  if (bypass) {
    response.setHeader("x-cache", "BYPASS");
    next();
    return;
  }

  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached) {
    response.status(cached.statusCode);
    if (cached.contentType) response.setHeader("content-type", cached.contentType);
    response.setHeader("x-cache", "HIT");
    response.end(cached.body);
    return;
  }

  response.setHeader("x-cache", "MISS");
  const chunks: Buffer[] = [];
  const originalWrite = response.write.bind(response);
  const originalEnd = response.end.bind(response);
  response.write = ((chunk: unknown, ...args: unknown[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return originalWrite(chunk as never, ...(args as never[]));
  }) as Response["write"];
  response.end = ((chunk?: unknown, ...args: unknown[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (response.statusCode === 200) {
      cache.set(key, {
        body: Buffer.concat(chunks),
        statusCode: response.statusCode,
        contentType: response.getHeader("content-type")?.toString(),
      });
    }
    return originalEnd(chunk as never, ...(args as never[]));
  }) as Response["end"];
  next();
};

export const clearResponseCache = (): void => cache.clear();
