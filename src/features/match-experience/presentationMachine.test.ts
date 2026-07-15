import { createActor } from "xstate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBattle, getBattleView, getEligibleCards, revealRound, selectCard, type BattleState } from "../../domain/battle";
import { gameCatalog, starterLineups } from "../../data/generated/gameCatalog";
import { motionPresets } from "./motionPresets";
import { isFinalShift, isMatchPoint, presentationMachine, reconstructPresentation, type PresentationMachineInput } from "./presentationMachine";

function initialBattle(): BattleState {
  const player = starterLineups.find((lineup) => lineup.mode === "nhl-circuit")!;
  const opponent = starterLineups.filter((lineup) => lineup.mode === "nhl-circuit")[1]!;
  return createBattle({ seed: "v2-machine", mode: "nhl-circuit", difficulty: "rookie", catalog: gameCatalog, playerLineup: player, opponentLineup: opponent });
}

function input(overrides: Partial<PresentationMachineInput> = {}): PresentationMachineInput {
  return {
    target: "matchIntro",
    domainPhase: "selecting",
    matchComplete: false,
    matchPoint: false,
    finalShift: false,
    settlementComplete: false,
    settlementFailed: false,
    preset: motionPresets.fastBroadcast,
    reducedMotion: true,
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("Match Experience V2 presentation machine", () => {
  it("runs the valid intro, commit, reveal, comparison, result, and next-round path", () => {
    vi.useFakeTimers();
    const actor = createActor(presentationMachine, { input: input() }).start();
    expect(actor.getSnapshot().value).toBe("matchIntro");
    vi.runAllTimers();
    expect(actor.getSnapshot().value).toBe("awaitingSelection");
    actor.send({ type: "CARD_SELECTED" });
    expect(actor.getSnapshot().value).toBe("cardCommit");
    vi.runAllTimers();
    expect(actor.getSnapshot().value).toBe("awaitingAuthoritativeReveal");
    actor.send({ type: "REVEAL_REQUESTED" });
    actor.send({ type: "REVEAL_REQUESTED" });
    expect(actor.getSnapshot().context.requestPending).toBe(true);
    actor.send({ type: "AUTHORITATIVE_REVEAL_RECEIVED", matchComplete: false, matchPoint: false, finalShift: false });
    vi.runAllTimers();
    expect(actor.getSnapshot().value).toBe("roundResult");
    actor.send({ type: "CONTINUE" });
    vi.runAllTimers();
    expect(actor.getSnapshot().value).toBe("awaitingSelection");
  });

  it("ignores invalid events and clears the request lock on reveal failure", () => {
    const actor = createActor(presentationMachine, { input: input({ target: "awaitingAuthoritativeReveal", domainPhase: "awaiting-reveal" }) }).start();
    actor.send({ type: "CONTINUE" });
    expect(actor.getSnapshot().value).toBe("awaitingAuthoritativeReveal");
    actor.send({ type: "REVEAL_REQUESTED" });
    expect(actor.getSnapshot().context.requestPending).toBe(true);
    actor.send({ type: "REVEAL_FAILED" });
    expect(actor.getSnapshot().context.requestPending).toBe(false);
  });

  it("routes Final Shift, Match Point, settlement error, retry, and completion", () => {
    vi.useFakeTimers();
    const actor = createActor(presentationMachine, { input: input({ target: "roundResult", matchPoint: true, finalShift: true }) }).start();
    actor.send({ type: "CONTINUE" });
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(actor.getSnapshot().value).toBe("finalShift");

    const settlement = createActor(presentationMachine, { input: input({ target: "settlementError", matchComplete: true, settlementFailed: true }) }).start();
    expect(settlement.getSnapshot().value).toBe("settlementError");
    settlement.send({ type: "RETRY_SETTLEMENT" });
    expect(settlement.getSnapshot().value).toBe("settling");
    settlement.send({ type: "SETTLEMENT_COMPLETED" });
    expect(settlement.getSnapshot().value).toBe("complete");
  });
});

describe("domain-to-presentation reconstruction", () => {
  it("reconstructs selecting, locked, review, final, settling, error, and complete stable states", () => {
    const selecting = initialBattle();
    const selectingView = getBattleView(selecting, "player");
    expect(reconstructPresentation({ battle: selectingView, reviewingRound: false, restored: true, settling: false, settlementComplete: false }).target).toBe("awaitingSelection");

    const locked = { ...selectCard(selecting, "player", getEligibleCards(selecting, "player")[0].card.id), phase: "awaiting-reveal" as const };
    expect(reconstructPresentation({ battle: getBattleView(locked, "player"), reviewingRound: false, restored: true, settling: false, settlementComplete: false }).target).toBe("awaitingAuthoritativeReveal");

    const withOpponent = selectCard(selecting, "opponent", getEligibleCards(selecting, "opponent")[0].card.id);
    const bothLocked = selectCard(withOpponent, "player", getEligibleCards(withOpponent, "player")[0].card.id);
    const reviewed = revealRound(bothLocked);
    expect(reconstructPresentation({ battle: getBattleView(reviewed, "player"), reviewingRound: true, restored: true, settling: false, settlementComplete: false }).target).toBe("roundResult");

    const completeView = { ...selectingView, phase: "complete" as const, winner: "player" as const };
    expect(reconstructPresentation({ battle: completeView, reviewingRound: false, restored: true, settling: false, settlementComplete: false }).target).toBe("matchFinal");
    expect(reconstructPresentation({ battle: completeView, reviewingRound: false, restored: true, settling: true, settlementComplete: false }).target).toBe("settling");
    expect(reconstructPresentation({ battle: completeView, reviewingRound: false, restored: true, settling: false, settlementComplete: false, settlementError: "offline" }).target).toBe("settlementError");
    expect(reconstructPresentation({ battle: completeView, reviewingRound: false, restored: true, settling: false, settlementComplete: true }).target).toBe("complete");
  });

  it("derives Match Point and Final Shift only from real score and round state", () => {
    const view = getBattleView(initialBattle(), "player");
    expect(isMatchPoint({ ...view, roundIndex: 3, roundWins: { player: 2, opponent: 1 } })).toBe(true);
    expect(isFinalShift({ ...view, roundIndex: 4, roundWins: { player: 2, opponent: 2 } })).toBe(true);
    expect(isFinalShift({ ...view, roundIndex: 4, roundWins: { player: 3, opponent: 1 } })).toBe(false);
  });
});
