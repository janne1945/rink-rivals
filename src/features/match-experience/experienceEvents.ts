import type { RoundWinner } from "../../domain/battle";

interface RoundEventData {
  readonly matchId: string;
  readonly roundNumber: number;
}

export type MatchExperienceEvent =
  | { readonly type: "match_intro_started"; readonly matchId: string }
  | (RoundEventData & { readonly type: "category_announced"; readonly categoryId: string })
  | (RoundEventData & { readonly type: "card_committed"; readonly cardId: string })
  | (RoundEventData & { readonly type: "rival_entered" })
  | (RoundEventData & { readonly type: "authoritative_reveal_received" })
  | (RoundEventData & { readonly type: "cards_revealed" })
  | (RoundEventData & { readonly type: "comparison_resolved"; readonly winner: RoundWinner })
  | (RoundEventData & { readonly type: "round_won" })
  | (RoundEventData & { readonly type: "round_lost" })
  | (RoundEventData & { readonly type: "round_tied" })
  | (RoundEventData & { readonly type: "score_updated"; readonly playerScore: number; readonly rivalScore: number })
  | (RoundEventData & { readonly type: "match_point" })
  | (RoundEventData & { readonly type: "final_shift" })
  | { readonly type: "match_completed"; readonly matchId: string; readonly winner: RoundWinner }
  | { readonly type: "settlement_completed"; readonly matchId: string }
  | { readonly type: "settlement_failed"; readonly matchId: string };

export type MatchExperienceEventSink = (event: MatchExperienceEvent) => void;

export const noopExperienceEventSink: MatchExperienceEventSink = () => undefined;

