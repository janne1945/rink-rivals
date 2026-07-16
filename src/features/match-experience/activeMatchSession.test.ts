import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearActiveMatchSession,
  clearPendingMatchAbandonment,
  markMatchForAbandonment,
  readActiveMatchSession,
  readPendingMatchAbandonment,
  updateActiveMatchSession,
  writeActiveMatchSession,
} from "./activeMatchSession";

describe("active Match Experience V2 session", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
      } satisfies Storage,
    });
  });
  afterEach(() => {
    clearActiveMatchSession();
    clearPendingMatchAbandonment();
  });

  it("round-trips the safe resume contract without opponent data", () => {
    writeActiveMatchSession({
      version: 2,
      clientMatchId: "client-1",
      mode: "nhl-circuit",
      difficulty: "rookie",
      source: { kind: "ghost-challenge", slug: "0123456789abcdef0123456789abcdef", lineupId: "lineup-1" },
      pendingSelection: { cardId: "card-1", roundIndex: 2 },
      reviewingRound: false,
    });
    expect(readActiveMatchSession()).toEqual(expect.objectContaining({
      clientMatchId: "client-1",
      pendingSelection: { cardId: "card-1", roundIndex: 2 },
    }));
    expect(sessionStorage.getItem("rink-rivals:match-experience-v2:active-match")).not.toMatch(/opponent|ghost_selections/i);
  });

  it("updates an existing session and rejects malformed state", () => {
    writeActiveMatchSession({ version: 2, clientMatchId: "client-1", mode: "open-ice", difficulty: "pro", source: { kind: "ai" }, reviewingRound: false });
    updateActiveMatchSession((session) => ({ ...session, reviewingRound: true }));
    expect(readActiveMatchSession()?.reviewingRound).toBe(true);
    sessionStorage.setItem("rink-rivals:match-experience-v2:active-match", JSON.stringify({ version: 1, clientMatchId: "x", mode: "invalid", difficulty: "pro" }));
    expect(readActiveMatchSession()).toBeNull();
  });

  it("persists only the safe abandonment contract across tabs", () => {
    const session = { version: 2, clientMatchId: "arena-1", mode: "open-ice", difficulty: "pro", source: { kind: "arena" }, reviewingRound: false } as const;
    markMatchForAbandonment(session);
    expect(readPendingMatchAbandonment()).toEqual({ version: 1, clientMatchId: "arena-1", source: { kind: "arena" } });
    expect(window.localStorage.getItem("rink-rivals:match-experience-v2:pending-abandonment")).not.toMatch(/lineup|opponent|round/i);
  });
});
