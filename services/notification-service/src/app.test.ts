import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, logProcessError } from "./middleware/error-handler";

vi.mock("./lib/prisma", () => ({ prisma: { notification: { create: vi.fn() } } }));
import { createApp } from "./app";

describe("notification app wiring", () => {
  it("serves /health", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.body).toMatchObject({ status: "OK", service: "notification-service" });
  });

  it("protects /internal with INTERNAL_API_KEY", async () => {
    expect((await request(createApp()).post("/internal/notifications").send({})).status).toBe(401);
  });
});

describe("error handler mapping", () => {
  const run = (error: unknown) => {
    const result = { status: 0, body: undefined as unknown };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    errorHandler(error, {} as never, { status: (code: number) => { result.status = code; return { json: (body: unknown) => { result.body = body; } }; } } as never, vi.fn());
    return result;
  };
  const prismaError = (code: string) => Object.assign(new Error(code), { name: "PrismaClientKnownRequestError", code });

  it("maps unique violations to 409, missing rows to 404 and connection loss to 503", () => {
    expect(run(prismaError("P2002")).status).toBe(409);
    expect(run(prismaError("P2025")).status).toBe(404);
    expect(run(prismaError("P1001"))).toEqual({ status: 503, body: { error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" } });
    expect(run(Object.assign(new Error("init"), { name: "PrismaClientInitializationError" })).status).toBe(503);
  });

  it("maps zod errors to 400 with details and non-errors to 500", async () => {
    const { z } = await import("zod");
    const zodError = z.object({ a: z.string() }).safeParse({}).error;
    const result = run(zodError);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: "VALIDATION_ERROR" });
    expect(run("plain string").status).toBe(500);
  });

  it("logs process errors as one JSON line without stack traces", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logProcessError("job_failed", new Error("boom"));
    logProcessError("job_failed", "text");
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ event: "job_failed", name: "Error", message: "boom" });
    expect(JSON.parse(spy.mock.calls[1][0] as string)).toEqual({ event: "job_failed", value: "text" });
  });
});
