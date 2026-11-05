import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkTarget, classifyHealth, createHealthMonitor, isTransition, STATUS_CHANGED_ACTION, type HealthPrisma } from "./health-monitor";

const okResponse = (body: unknown = { status: "OK" }, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const makePrisma = (previous: { serviceName: string; status: "UP" | "DOWN" | "DEGRADED" }[] = []) => {
  const mock = {
    serviceHealthLog: { findMany: vi.fn().mockResolvedValue(previous), createMany: vi.fn().mockReturnValue("createMany-op") },
    auditLog: { create: vi.fn((args: unknown) => ({ op: "audit", args })) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return { mock, prisma: mock as unknown as HealthPrisma };
};

const targets = [{ serviceName: "auth-service", url: "http://auth:4001" }, { serviceName: "gateway", url: "http://gateway:4000" }];

describe("classifyHealth", () => {
  it("treats a fast 2xx as UP", () => {
    expect(classifyHealth(200, { status: "OK" }, 15, 1000)).toBe("UP");
  });

  it("treats a 2xx that reports DEGRADED in its body as DEGRADED", () => {
    expect(classifyHealth(200, { status: "degraded" }, 15, 1000)).toBe("DEGRADED");
  });

  it("treats a 2xx slower than the threshold as DEGRADED", () => {
    expect(classifyHealth(200, { status: "OK" }, 1500, 1000)).toBe("DEGRADED");
  });

  it("treats non-2xx and missing responses as DOWN", () => {
    expect(classifyHealth(503, { status: "DEGRADED" }, 10, 1000)).toBe("DOWN");
    expect(classifyHealth(null, null, null, 1000)).toBe("DOWN");
  });
});

describe("isTransition", () => {
  it("flags going DOWN and recovering from DOWN", () => {
    expect(isTransition("UP", "DOWN")).toBe(true);
    expect(isTransition("DOWN", "UP")).toBe(true);
    expect(isTransition("DEGRADED", "DOWN")).toBe(true);
  });

  it("ignores unchanged status, first observations and UP/DEGRADED flapping", () => {
    expect(isTransition("UP", "UP")).toBe(false);
    expect(isTransition(undefined, "DOWN")).toBe(false);
    expect(isTransition("UP", "DEGRADED")).toBe(false);
  });
});

describe("checkTarget", () => {
  it("probes <url>/health and records the response time", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    let tick = 100;
    const result = await checkTarget(targets[0], fetchImpl, 2000, 1000, () => (tick += 25));
    expect(fetchImpl).toHaveBeenCalledWith("http://auth:4001/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(result).toEqual({ serviceName: "auth-service", status: "UP", responseTimeMs: 25 });
  });

  it("aborts after the timeout and reports DOWN without a response time", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const pending = checkTarget(targets[0], fetchImpl, 2000, 1000);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual({ serviceName: "auth-service", status: "DOWN", responseTimeMs: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports DOWN when the request fails at network level", async () => {
    const result = await checkTarget(targets[0], vi.fn().mockRejectedValue(new Error("ECONNREFUSED")), 2000, 1000);
    expect(result.status).toBe("DOWN");
  });

  it("still classifies a 2xx with a non-JSON body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => { throw new Error("not json"); } });
    expect((await checkTarget(targets[0], fetchImpl, 2000, 1000)).status).toBe("UP");
  });
});

describe("createHealthMonitor", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn().mockResolvedValue(okResponse());
  });

  it("checks every target in one poll and stores one log per service", async () => {
    const { mock, prisma } = makePrisma();
    const monitor = createHealthMonitor({ prisma, targets, fetchImpl });
    const result = await monitor.poll();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.persisted).toBe(true);
    expect(mock.serviceHealthLog.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ serviceName: "auth-service", status: "UP" }),
      expect.objectContaining({ serviceName: "gateway", status: "UP" }),
    ] });
    expect(mock.auditLog.create).not.toHaveBeenCalled();
  });

  it("writes exactly one audit entry when a service goes down and one when it recovers", async () => {
    const { mock, prisma } = makePrisma();
    const monitor = createHealthMonitor({ prisma, targets: [targets[0]], fetchImpl });
    await monitor.poll(); // UP (first observation, no audit)
    fetchImpl.mockRejectedValue(new Error("down"));
    await monitor.poll(); // UP -> DOWN
    await monitor.poll(); // DOWN -> DOWN (no spam)
    await monitor.poll(); // DOWN -> DOWN
    fetchImpl.mockResolvedValue(okResponse());
    await monitor.poll(); // DOWN -> UP
    expect(mock.auditLog.create).toHaveBeenCalledTimes(2);
    expect(mock.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: STATUS_CHANGED_ACTION, adminUserId: "system", targetType: "Service", targetId: "auth-service", metadata: { from: "UP", to: "DOWN" } } });
    expect(mock.auditLog.create.mock.calls[1][0]).toMatchObject({ data: { metadata: { from: "DOWN", to: "UP" } } });
  });

  it("continues from the last persisted status after a restart instead of auditing again", async () => {
    const { mock, prisma } = makePrisma([{ serviceName: "auth-service", status: "DOWN" }]);
    fetchImpl.mockRejectedValue(new Error("still down"));
    const monitor = createHealthMonitor({ prisma, targets: [targets[0]], fetchImpl });
    await monitor.poll();
    expect(mock.auditLog.create).not.toHaveBeenCalled();
    fetchImpl.mockResolvedValue(okResponse());
    const recovered = await monitor.poll();
    expect(recovered.transitions).toEqual([{ serviceName: "auth-service", from: "DOWN", to: "UP" }]);
  });

  it("joins a running poll instead of starting an overlapping one", async () => {
    const { prisma } = makePrisma();
    let release: () => void = () => undefined;
    fetchImpl.mockImplementation(() => new Promise((resolve) => { release = () => resolve(okResponse()); }));
    const monitor = createHealthMonitor({ prisma, targets: [targets[0]], fetchImpl });
    const first = monitor.poll();
    const second = monitor.poll();
    expect(monitor.isRunning()).toBe(true);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.joined).toBeUndefined();
    expect(b.joined).toBe(true);
    expect(monitor.isRunning()).toBe(false);
  });

  it("never throws when the database write fails and retries the transition on the next poll", async () => {
    const { mock, prisma } = makePrisma([{ serviceName: "auth-service", status: "UP" }]);
    const logger = vi.fn();
    fetchImpl.mockRejectedValue(new Error("down"));
    mock.$transaction.mockRejectedValueOnce(new Error("db unavailable"));
    const monitor = createHealthMonitor({ prisma, targets: [targets[0]], fetchImpl, logger });
    const failed = await monitor.poll();
    expect(failed).toMatchObject({ persisted: false, transitions: [] });
    expect(logger).toHaveBeenCalledWith("health_monitor_persist_error", { message: "db unavailable" });
    const retried = await monitor.poll();
    expect(retried.transitions).toEqual([{ serviceName: "auth-service", from: "UP", to: "DOWN" }]);
  });

  it("still polls when seeding previous statuses fails", async () => {
    const { mock, prisma } = makePrisma();
    mock.serviceHealthLog.findMany.mockRejectedValueOnce(new Error("seed failed"));
    const logger = vi.fn();
    const result = await createHealthMonitor({ prisma, targets: [targets[0]], fetchImpl, logger }).poll();
    expect(result.persisted).toBe(true);
    expect(logger).toHaveBeenCalledWith("health_monitor_seed_error", { message: "seed failed" });
  });
});
