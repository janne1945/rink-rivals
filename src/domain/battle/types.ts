import type {
  CardCatalog,
  GoalieAttributes,
  SkaterAttributes,
} from '../cards/types';
import type {
  GameMode,
  Lineup,
  LineupSlot,
  ResolvedLineup,
  ResolvedLineupCard,
} from '../lineups/types';

export const BATTLE_ROUND_COUNT = 5;

export type BattleSide = 'player' | 'opponent';
export type RoundWinner = BattleSide | 'tie';
export type BattlePhase = 'selecting' | 'awaiting-reveal' | 'complete';
export type BattleViewer = BattleSide | 'spectator';
export type AiDifficulty = 'rookie' | 'pro' | 'elite';

interface BattleSituationBase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly eligibleSlots: readonly LineupSlot[];
}

export interface SkaterBattleSituation extends BattleSituationBase {
  readonly role: 'skater';
  readonly weights: Readonly<Partial<Record<keyof SkaterAttributes, number>>>;
}

export interface GoalieBattleSituation extends BattleSituationBase {
  readonly role: 'goalie';
  readonly weights: Readonly<Partial<Record<keyof GoalieAttributes, number>>>;
}

export type BattleSituation = SkaterBattleSituation | GoalieBattleSituation;

export interface BattleLineups {
  readonly player: ResolvedLineup;
  readonly opponent: ResolvedLineup;
}

export interface SideSelections {
  readonly player?: string;
  readonly opponent?: string;
}

export interface SideCardIds {
  readonly player: readonly string[];
  readonly opponent: readonly string[];
}

export interface SideRoundWins {
  readonly player: number;
  readonly opponent: number;
}

export interface CardRoundScore {
  readonly base: number;
  readonly variance: number;
  readonly total: number;
}

export interface BattleRoundResult {
  readonly roundNumber: number;
  readonly situation: BattleSituation;
  readonly playerCard: ResolvedLineupCard;
  readonly opponentCard: ResolvedLineupCard;
  readonly playerScore: CardRoundScore;
  readonly opponentScore: CardRoundScore;
  readonly winner: RoundWinner;
}

export interface BattleState {
  readonly id: string;
  readonly seed: string;
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly phase: BattlePhase;
  readonly roundIndex: number;
  readonly situations: readonly BattleSituation[];
  readonly lineups: BattleLineups;
  readonly usedCardIds: SideCardIds;
  readonly pendingSelections: SideSelections;
  readonly roundWins: SideRoundWins;
  readonly results: readonly BattleRoundResult[];
  readonly winner?: RoundWinner;
}

export interface CreateBattleInput {
  readonly seed: string | number;
  readonly mode: GameMode;
  readonly difficulty?: AiDifficulty;
  readonly catalog: CardCatalog;
  readonly playerLineup: Lineup;
  readonly opponentLineup: Lineup;
  readonly situationDeck?: readonly BattleSituation[];
}

export type BattleViewState = Omit<BattleState, 'pendingSelections'> & {
  readonly selectionStatus: Readonly<Record<BattleSide, boolean>>;
  readonly visibleSelection?: string;
};

export type BattleRuleErrorCode =
  | 'lineup-mode-mismatch'
  | 'invalid-situation-deck'
  | 'invalid-phase'
  | 'side-already-selected'
  | 'card-not-eligible'
  | 'missing-selection';

export class BattleRuleError extends Error {
  readonly code: BattleRuleErrorCode;

  constructor(code: BattleRuleErrorCode, message: string) {
    super(message);
    this.name = 'BattleRuleError';
    this.code = code;
  }
}
