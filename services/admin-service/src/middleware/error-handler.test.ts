import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler";

const response = () => {
  const result = { statusCode: 0, body: undefined as unknown };
  const value = { status: (code: number) => { result.statusCode = code; return { json: (body: unknown) => { result.body = body; } }; } };
  return { result, value };
};

describe("admin error handler", () => {
  it("maps P2021 to DATABASE_UNAVAILABLE without exposing Prisma details", () => {
    const output = response(); vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("missing table"), { name: "PrismaClientKnownRequestError", code: "P2021" });
    errorHandler(error, {} as never, output.value as never, vi.fn());
    expect(output.result).toEqual({ statusCode: 503, body: { error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" } });
  });
});
