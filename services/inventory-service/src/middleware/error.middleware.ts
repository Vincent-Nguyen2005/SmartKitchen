import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error("[Error]", err.message);

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: "Validation Error",
      details: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  if ((err as Error & { statusCode?: number }).statusCode) {
    const statusCode = (err as Error & { statusCode: number }).statusCode;
    return res.status(statusCode).json({
      success: false,
      error: (err as Error & { code?: string }).code || "REQUEST_FAILED",
      message: err.message,
    });
  }

  if (err.message === "Item not found") {
    return res.status(404).json({ success: false, error: "Item not found" });
  }

  const statusCode = (err as Error & { statusCode?: number }).statusCode;
  const code = (err as Error & { code?: string }).code;
  if (statusCode && statusCode >= 400 && statusCode <= 599) {
    return res.status(statusCode).json({ success: false, error: code || "REQUEST_FAILED", message: err.message });
  }

  return res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
}
