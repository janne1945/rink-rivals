import { describe, expect, it } from "vitest";

import { createBattle, getEligibleCards, selectCard, type BattleState } from "../../domain/battle";
import { gameCatalog, starterLineups } from "../../data/generated/gameCatalog";
import type { PlayMatchRoundResult } from "../../infrastructure/supabase";
import { applyAuthoritativeRound } from "./authoritativeBattle";

function battle(): BattleState {
  const lineup = starterLineups.find(({ mode }) => mode === "nhl-circuit")!;
  return createBattle({
    seed: "authoritative-round-test",
    mode: "nhl-circuit",
    difficulty: "rookie",
    catalog: gameCatalog,
    playerLineup: lineup,
    opponentLineup: { ...lineup, id: "server-opponent", name: "Server Opponent" },
  });
}

function lockFirstEligible(state: BattleState): BattleState {
  const cardId = getEligibleCards(state, "player")[0].card.id;
  return { ...selectCard(state, "player", cardId), phase: "awaiting-reveal" };
}

function serverRound(state: BattleState, winner: PlayMatchRoundResult["winner"] = "opponent"): PlayMatchRoundResult {
  const player = state.lineups.player.cards.find(({ card }) => card.id === state.pendingSelections.player)!;
  const opponent = getEligibleCards(state, "opponent")[0];
  const situation = state.situations[state.roundIndex];
  const playerScore = { base: 123.45, variance: -23.45, total: 100 };
  const opponentScore = { base: 67.89, variance: 33.11, total: 101 };
  return {
    status: "played",
    clientMatchId: "server-match",
    roundIndex: state.roundIndex,
    situationId: situation.id,
    playerCardId: player.card.id,
    playerSlot: player.slot,
    playerScore: playerScore.total,
    opponentCardId: opponent.card.id,
    opponentSlot: opponent.slot,
    opponentScore: opponentScore.total,
    winner,
    transcript: { situation, player: playerScore, opponent: opponentScore },
  };
}

describe("applyAuthoritativeRound", () => {
  it("copies the server cards, scores, transcript, and winner without recalculating them", () => {
    const locked = lockFirstEligible(battle());
    const response = serverRound(locked, "opponent");
    const next = applyAuthoritativeRound(locked, response);

    expect(next.results[0]).toMatchObject({
      winner: "opponent",
      playerScore: { base: 123.45, variance: -23.45, total: 100 },
      opponentScore: { base: 67.89, variance: 33.11, total: 101 },
    });
    expect(next.roundWins).toEqual({ player: 0, opponent: 1 });
    expect(next.results[0].playerScore.total).toBe(response.playerScore);
  });

  it("rejects mismatched round, situation, player selection, and transcript totals", () => {
    const locked = lockFirstEligible(battle());
    const response = serverRound(locked);
    expect(() => applyAuthoritativeRound(locked, { ...response, roundIndex: 1 })).toThrow(/round index/i);
    expect(() => applyAuthoritativeRound(locked, { ...response, situationId: "different" })).toThrow(/situation/i);
    expect(() => applyAuthoritativeRound(locked, { ...response, playerCardId: "different" })).toThrow(/player selection/i);
    expect(() => applyAuthoritativeRound(locked, { ...response, playerScore: 999 })).toThrow(/transcript/i);
  });

  it("derives only the final match winner from five server round winners", () => {
    let state = battle();
    for (let round = 0; round < 5; round += 1) {
      const locked = lockFirstEligible(state);
      const response = serverRound(locked, round < 3 ? "player" : "opponent");
      state = applyAuthoritativeRound(locked, response);
    }
    expect(state.phase).toBe("complete");
    expect(state.results).toHaveLength(5);
    expect(state.roundWins).toEqual({ player: 3, opponent: 2 });
    expect(state.winner).toBe("player");
  });
});
