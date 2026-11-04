import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

type PrismaLikeError = Error & { code?: string };
const isPrismaKnownError = (error: unknown): error is PrismaLikeError => error instanceof Error && error.name === "PrismaClientKnownRequestError";
const isPrismaInitializationError = (error: unknown): boolean => error instanceof Error && error.name === "PrismaClientInitializationError";

/**
 * Prisma codes meaning "the database cannot serve this request right now", answered as 503:
 * P1001 unreachable, P1002 connection timed out, P1008 operation timed out,
 * P1017 server closed the connection (e.g. pooled connections when Postgres stops),
 * P2021 table missing (migrations not applied), P2024 connection pool timeout.
 */
export const DATABASE_UNAVAILABLE_CODES = ["P1001", "P1002", "P1008", "P1017", "P2021", "P2024"] as const;
const isDatabaseUnavailable = (error: unknown): boolean =>
  isPrismaInitializationError(error) || (isPrismaKnownError(error) && (DATABASE_UNAVAILABLE_CODES as readonly string[]).includes(error.code || ""));

const logError = (error: unknown): void => {
  const value = error instanceof Error ? { name: error.name, message: error.message, code: (error as { code?: string }).code } : { value: String(error) };
  console.error(JSON.stringify({ event: "request_error", ...value }));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  logError(error);
  if (error instanceof ZodError) {
    response.status(400).json({ error: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() });
    return;
  }
  if (isPrismaKnownError(error)) {
    if (error.code === "P2002") { response.status(409).json({ error: "CONFLICT", message: "Resource already exists" }); return; }
    if (error.code === "P2025") { response.status(404).json({ error: "NOT_FOUND", message: "Resource not found" }); return; }
  }
  if (isDatabaseUnavailable(error)) {
    response.status(503).json({ error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" });
    return;
  }
  response.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
};

export const logProcessError = (event: string, error: unknown): void => {
  const value = error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) };
  console.error(JSON.stringify({ event, ...value }));
};
