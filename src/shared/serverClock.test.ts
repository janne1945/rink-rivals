import { describe, expect, it } from "vitest";

import { createServerClockAnchor, serverTimestampAt } from "./serverClock";

describe("server-authoritative monotonic clock", () => {
  it("advances server time only by monotonic elapsed time", () => {
    const anchor = createServerClockAnchor(
      "2026-07-14T23:59:30.000Z",
      1_000,
      Date.parse("2035-01-01T00:00:00.000Z"),
    );

    expect(new Date(serverTimestampAt(anchor, 61_000)).toISOString())
      .toBe("2026-07-15T00:00:30.000Z");
  });

  it("uses one wall-clock fallback without following later wall-clock jumps", () => {
    const fallbackWallTime = Date.parse("2026-07-14T12:00:00.000Z");
    const anchor = createServerClockAnchor("not-a-date", 500, fallbackWallTime);

    expect(new Date(serverTimestampAt(anchor, 120_500)).toISOString())
      .toBe("2026-07-14T12:02:00.000Z");
  });

  it("does not move behind a freshly replaced server anchor", () => {
    const anchor = createServerClockAnchor(
      "2026-07-15T00:00:00.000Z",
      2_000,
      Date.parse("2035-01-01T00:00:00.000Z"),
    );

    expect(new Date(serverTimestampAt(anchor, 1_500)).toISOString())
      .toBe("2026-07-15T00:00:00.000Z");
  });

  it("rejects invalid clock samples", () => {
    expect(() => createServerClockAnchor("not-a-date", Number.NaN, 0)).toThrow(/Monotonic/);
    expect(() => serverTimestampAt({ monotonicTime: 0, serverTime: 0 }, Number.POSITIVE_INFINITY))
      .toThrow(/Monotonic/);
  });
});
