import {
  BATTLE_ROUND_COUNT,
  BattleRuleError,
  type BattleState,
  type RoundWinner,
} from "../../domain/battle";
import type { PlayMatchRoundResult } from "../../infrastructure/supabase";

function matchWinner(roundWins: BattleState["roundWins"]): RoundWinner {
  if (roundWins.player === roundWins.opponent) return "tie";
  return roundWins.player > roundWins.opponent ? "player" : "opponent";
}

/** Applies a server-scored round without recalculating cards, scores, or winner in the browser. */
export function applyAuthoritativeRound(state: BattleState, round: PlayMatchRoundResult): BattleState {
  if (state.phase !== "awaiting-reveal") {
    throw new BattleRuleError("invalid-phase", "A server round can only be applied after a player card is locked.");
  }
  if (round.roundIndex !== state.roundIndex) throw new Error("The server returned a different round index.");
  const expectedSituation = state.situations[state.roundIndex];
  if (round.situationId !== expectedSituation.id || round.transcript.situation.id !== expectedSituation.id) {
    throw new Error("The server returned a different battle situation.");
  }
  if (state.pendingSelections.player !== round.playerCardId) {
    throw new Error("The server returned a different player selection.");
  }
  const playerCard = state.lineups.player.cards.find(({ card, slot }) => card.id === round.playerCardId && slot === round.playerSlot);
  const opponentCard = state.lineups.opponent.cards.find(({ card, slot }) => card.id === round.opponentCardId && slot === round.opponentSlot);
  if (!playerCard || !opponentCard) throw new Error("The server returned a card outside the match snapshots.");
  if (round.transcript.player.value !== round.playerScore || round.transcript.opponent.value !== round.opponentScore) {
    throw new Error("The server returned an inconsistent round transcript.");
  }

  const roundWins = {
    player: state.roundWins.player + (round.winner === "player" ? 1 : 0),
    opponent: state.roundWins.opponent + (round.winner === "opponent" ? 1 : 0),
  };
  const results = [...state.results, {
    roundNumber: state.roundIndex + 1,
    situation: round.transcript.situation,
    playerCard,
    opponentCard,
    playerScore: round.transcript.player,
    opponentScore: round.transcript.opponent,
    winner: round.winner,
    tieBreaker: round.tieBreaker,
  }];
  const complete = results.length === BATTLE_ROUND_COUNT;
  return {
    ...state,
    phase: complete ? "complete" : "selecting",
    roundIndex: complete ? state.roundIndex : state.roundIndex + 1,
    usedCardIds: {
      player: [...state.usedCardIds.player, playerCard.card.id],
      opponent: [...state.usedCardIds.opponent, opponentCard.card.id],
    },
    pendingSelections: {},
    roundWins,
    results,
    winner: complete ? matchWinner(roundWins) : undefined,
  };
}
