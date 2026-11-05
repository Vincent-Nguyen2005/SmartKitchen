import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorHandler, logProcessError } from "./error-handler";

const run = (error: unknown) => {
  const result = { status: 0, body: undefined as unknown };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  errorHandler(error, {} as never, { status: (code: number) => { result.status = code; return { json: (body: unknown) => { result.body = body; } }; } } as never, vi.fn());
  return result;
};
const prismaError = (code: string) => Object.assign(new Error(code), { name: "PrismaClientKnownRequestError", code });

describe("admin error handler mapping", () => {
  it("maps Prisma errors to stable JSON statuses", () => {
    expect(run(prismaError("P2002"))).toEqual({ status: 409, body: { error: "CONFLICT", message: "Resource already exists" } });
    expect(run(prismaError("P2025")).status).toBe(404);
    expect(run(prismaError("P2021")).status).toBe(503);
    expect(run(prismaError("P1002")).status).toBe(503);
    expect(run(prismaError("P2003")).status).toBe(500);
  });

  it("maps zod errors to 400 with flattened details", () => {
    const result = run(z.object({ a: z.number() }).safeParse({ a: "x" }).error);
    expect(result.status).toBe(400);
    expect((result.body as { details: { fieldErrors: object } }).details.fieldErrors).toHaveProperty("a");
  });

  it("never leaks the message of unknown errors", () => {
    expect(run(new Error("password=hunter2"))).toEqual({ status: 500, body: { error: "INTERNAL_ERROR", message: "Internal server error" } });
    expect(run(42).status).toBe(500);
  });

  it("logs process-level errors as single JSON lines", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logProcessError("unhandled_rejection", new Error("x"));
    logProcessError("unhandled_rejection", null);
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "unhandled_rejection", message: "x" });
    expect(JSON.parse(spy.mock.calls[1][0] as string)).toEqual({ event: "unhandled_rejection", value: "null" });
  });
});
