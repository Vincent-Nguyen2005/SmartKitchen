import { describe, expect, it, vi } from "vitest";
import { DATABASE_UNAVAILABLE_CODES, errorHandler } from "./error-handler";

const run = (error: unknown) => {
  const result = { status: 0, body: undefined as unknown };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  errorHandler(error, {} as never, { status: (code: number) => { result.status = code; return { json: (body: unknown) => { result.body = body; } }; } } as never, vi.fn());
  return result;
};
const prismaError = (code: string, message = `Invalid prisma call\n    at secret/stack/frame.ts:1:1 (${code})`) =>
  Object.assign(new Error(message), { name: "PrismaClientKnownRequestError", code });
const UNAVAILABLE = { status: 503, body: { error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" } };

describe("error handler: database unavailable", () => {
  it.each(["P1001", "P1002", "P1008", "P1017", "P2024", "P2021"])("maps Prisma %s to 503 DATABASE_UNAVAILABLE without leaking details", (code) => {
    const result = run(prismaError(code));
    expect(result).toEqual(UNAVAILABLE);
    expect(JSON.stringify(result.body)).not.toMatch(/stack|secret|at /);
  });

  it("maps a P1017 dropped connection (Postgres stopped with open pool connections) to 503", () => {
    expect(run(prismaError("P1017", "Server has closed the connection."))).toEqual(UNAVAILABLE);
  });

  it("maps PrismaClientInitializationError (database unreachable at connect) to 503", () => {
    expect(run(Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError" }))).toEqual(UNAVAILABLE);
  });

  it("lists exactly the documented codes", () => {
    expect([...DATABASE_UNAVAILABLE_CODES].sort()).toEqual(["P1001", "P1002", "P1008", "P1017", "P2021", "P2024"]);
  });

  it("keeps other Prisma errors out of the 503 mapping", () => {
    expect(run(prismaError("P2003")).status).toBe(500);
    expect(run(prismaError("P2002")).status).toBe(409);
    expect(run(prismaError("P2025")).status).toBe(404);
  });
});
