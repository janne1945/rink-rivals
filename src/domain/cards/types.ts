export const LEAGUES = ['NHL', 'PWHL'] as const;

export type League = (typeof LEAGUES)[number];

export const HOCKEY_POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;

export type HockeyPosition = (typeof HOCKEY_POSITIONS)[number];
export type SkaterPosition = Exclude<HockeyPosition, 'G'>;

export const CARD_TYPES = ['base', 'featured', 'elite', 'signature'] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type PlayerRole = 'skater' | 'goalie';
export type Handedness = 'left' | 'right';

interface PlayerBase {
  readonly id: string;
  readonly name: string;
  readonly league: League;
  readonly team: string;
  readonly nationality: string;
  readonly archetype: string;
  readonly handedness: Handedness;
  readonly imageReference?: string;
}

export interface SkaterPlayer extends PlayerBase {
  readonly role: 'skater';
  readonly primaryPosition: SkaterPosition;
  readonly eligiblePositions: readonly SkaterPosition[];
}

export interface GoaliePlayer extends PlayerBase {
  readonly role: 'goalie';
  readonly primaryPosition: 'G';
  readonly eligiblePositions: readonly ['G'];
}

export type Player = SkaterPlayer | GoaliePlayer;

export interface SkaterAttributes {
  readonly speed: number;
  readonly shooting: number;
  readonly passing: number;
  readonly puckControl: number;
  readonly defense: number;
  readonly physicality: number;
  readonly hockeyIq: number;
  readonly clutch: number;
}

export interface GoalieAttributes {
  readonly reflexes: number;
  readonly positioning: number;
  readonly glove: number;
  readonly blocker: number;
  readonly reboundControl: number;
  readonly puckHandling: number;
  readonly consistency: number;
  readonly clutch: number;
}

interface CardVersionBase {
  readonly id: string;
  readonly playerId: string;
  readonly setId: string;
  readonly cardType: CardType;
  readonly overall: number;
  readonly abilities: readonly string[];
  readonly price: number;
  readonly availableFrom?: string;
  readonly availableTo?: string;
  readonly isPermanent: boolean;
}

export interface SkaterCardVersion extends CardVersionBase {
  readonly role: 'skater';
  readonly attributes: SkaterAttributes;
}

export interface GoalieCardVersion extends CardVersionBase {
  readonly role: 'goalie';
  readonly attributes: GoalieAttributes;
}

export type CardVersion = SkaterCardVersion | GoalieCardVersion;

export interface CardCatalog {
  readonly players: readonly Player[];
  readonly cards: readonly CardVersion[];
}

export interface ResolvedCard {
  readonly player: Player;
  readonly card: CardVersion;
}
