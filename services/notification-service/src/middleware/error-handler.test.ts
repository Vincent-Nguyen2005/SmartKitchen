import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler";

const response = () => {
  const result = { statusCode: 0, body: undefined as unknown };
  const value = { status: (code: number) => { result.statusCode = code; return { json: (body: unknown) => { result.body = body; } }; } };
  return { result, value };
};

describe("notification error handler", () => {
  it("maps missing database tables to a stable 503 response", () => {
    const output = response(); vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("table missing"), { name: "PrismaClientKnownRequestError", code: "P2021" });
    errorHandler(error, {} as never, output.value as never, vi.fn());
    expect(output.result).toEqual({ statusCode: 503, body: { error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" } });
  });

  it("maps unknown errors to a stable 500 response without leaking details", () => {
    const output = response();
    errorHandler(new Error("internal connection detail"), {} as never, output.value as never, vi.fn());
    expect(output.result).toEqual({ statusCode: 500, body: { error: "INTERNAL_ERROR", message: "Internal server error" } });
  });
});
