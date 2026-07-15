import { afterEach, describe, expect, it } from "vitest";

import { clearActiveMatchSession, readActiveMatchSession, updateActiveMatchSession, writeActiveMatchSession } from "./activeMatchSession";

describe("active Match Experience V2 session", () => {
  afterEach(clearActiveMatchSession);

  it("round-trips the safe resume contract without opponent data", () => {
    writeActiveMatchSession({
      version: 1,
      clientMatchId: "client-1",
      mode: "nhl-circuit",
      difficulty: "rookie",
      pendingSelection: { cardId: "card-1", roundIndex: 2 },
      reviewingRound: false,
    });
    expect(readActiveMatchSession()).toEqual(expect.objectContaining({
      clientMatchId: "client-1",
      pendingSelection: { cardId: "card-1", roundIndex: 2 },
    }));
    expect(sessionStorage.getItem("rink-rivals:match-experience-v2:active-match")).not.toMatch(/opponent|rival/i);
  });

  it("updates an existing session and rejects malformed state", () => {
    writeActiveMatchSession({ version: 1, clientMatchId: "client-1", mode: "open-ice", difficulty: "pro", reviewingRound: false });
    updateActiveMatchSession((session) => ({ ...session, reviewingRound: true }));
    expect(readActiveMatchSession()?.reviewingRound).toBe(true);
    sessionStorage.setItem("rink-rivals:match-experience-v2:active-match", JSON.stringify({ version: 1, clientMatchId: "x", mode: "invalid", difficulty: "pro" }));
    expect(readActiveMatchSession()).toBeNull();
  });
});

