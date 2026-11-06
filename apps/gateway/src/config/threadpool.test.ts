import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gatewayRoutes } from "./routes";

describe("gateway image thread pool", () => {
  it("leaves room for a stuck DNS lookup on every route at once", () => {
    const dockerfile = readFileSync(join(__dirname, "../../Dockerfile"), "utf8");
    const runtime = dockerfile.slice(dockerfile.indexOf("AS runtime"));
    const size = Number(runtime.match(/^ENV UV_THREADPOOL_SIZE=(\d+)\r?$/m)?.[1]);

    // libuv runs DNS as slow work, on at most (size + 1) / 2 threads. Lookups for missing containers hold those
    // threads for seconds, and every other lookup waits behind them. See docs/infra.md.
    expect(Math.floor((size + 1) / 2)).toBeGreaterThanOrEqual(gatewayRoutes.length);
  });
});
