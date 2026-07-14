import { describe, expect, it, vi } from "vitest";

import { persistMarketTab, readMarketTab } from "./marketTabStorage";

describe("market tab storage", () => {
  it("defaults to the base market for an unknown stored value", () => {
    const storage = {
      getItem: vi.fn(() => "featured"),
      setItem: vi.fn(),
    };

    expect(readMarketTab(storage)).toBe("base");
  });

  it("falls back safely when storage reads or writes throw", () => {
    const storage = {
      getItem: vi.fn(() => { throw new DOMException("Access denied", "SecurityError"); }),
      setItem: vi.fn(() => { throw new DOMException("Access denied", "SecurityError"); }),
    };

    expect(readMarketTab(storage)).toBe("base");
    expect(() => persistMarketTab("event", storage)).not.toThrow();
  });

  it("restores and persists valid tabs", () => {
    const storage = {
      getItem: vi.fn(() => "event"),
      setItem: vi.fn(),
    };

    expect(readMarketTab(storage)).toBe("event");
    persistMarketTab("base", storage);
    expect(storage.setItem).toHaveBeenCalledWith("rink-rivals:market-tab", "base");
  });
});
