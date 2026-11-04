import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/app-error";

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === code
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ success: false, code: err.code, message: err.message });
    return;
  }

  if (err?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({
        success: false,
        code: "INVALID_JSON",
        message: "Malformed JSON body",
      });
    return;
  }

  if (hasCode(err, "P2025")) {
    res
      .status(404)
      .json({ success: false, code: "NOT_FOUND", message: "Record not found" });
    return;
  }

  console.error("[shopping-list-service] unhandled error:", err);
  res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  });
};
