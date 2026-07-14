export const LEAGUES = ['NHL', 'PWHL'] as const;
export type League = (typeof LEAGUES)[number];

export const HOCKEY_POSITIONS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;
export type HockeyPosition = (typeof HOCKEY_POSITIONS)[number];
export type SkaterPosition = Exclude<HockeyPosition, 'G'>;

export const CARD_TYPES = ['starter', 'base', 'event', 'reward'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TIERS = ['starter', 'standard', 'featured', 'elite', 'signature'] as const;
export type CardTier = (typeof CARD_TIERS)[number];

export const MARKET_AVAILABILITIES = [
  'unavailable',
  'base-market',
  'event-shop',
  'reward-only',
] as const;
export type MarketAvailability = (typeof MARKET_AVAILABILITIES)[number];

export type PlayerRole = 'skater' | 'goalie';
export type Handedness = 'left' | 'right' | 'unknown';
export type SourceRosterStatus = 'active-roster' | 'roster-candidate' | 'rights' | 'legacy-retained';

export interface SourceMetadata {
  readonly provider: 'nhl-api' | 'nhl-official' | 'pwhl-hockeytech' | 'pwhl-draft' | 'legacy-catalog' | 'manual-import';
  readonly sourceIds: readonly string[];
  readonly sourceUrls: readonly string[];
  readonly snapshotDate: string;
  readonly rosterSeason: string;
  readonly statsSeason: string | null;
  readonly sourceRosterStatus: SourceRosterStatus;
  readonly positionSource:
    | 'official-exact'
    | 'derived-from-official-position-and-handedness'
    | 'derived-from-generic-official-position';
  readonly requiresManualReview: boolean;
  readonly manualReviewReasons: readonly string[];
}

export interface TeamVisualMetadata {
  readonly treatment: 'neutral-unlicensed';
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly abbreviation: string;
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly league: League;
  readonly active: boolean;
  readonly visualMetadata: TeamVisualMetadata;
  readonly sourceMetadata: Readonly<{
    provider: 'nhl-api' | 'pwhl-hockeytech';
    sourceId: string;
    sourceUrl: string;
    snapshotDate: string;
    rosterSeason: string;
  }>;
}

interface PlayerIdentityBase {
  readonly id: string;
  readonly name: string;
  readonly league: League;
  readonly currentTeamId: string;
  /** Transitional display label. Team identity remains authoritative via currentTeamId. */
  readonly team: string;
  readonly nationality: string | null;
  readonly archetype: string;
  readonly handedness: Handedness;
  readonly active: boolean;
  readonly imageReference?: string;
  readonly sourceMetadata: SourceMetadata;
}

export interface SkaterPlayerIdentity extends PlayerIdentityBase {
  readonly role: 'skater';
  readonly primaryPosition: SkaterPosition;
  readonly eligiblePositions: readonly SkaterPosition[];
}

export interface GoaliePlayerIdentity extends PlayerIdentityBase {
  readonly role: 'goalie';
  readonly primaryPosition: 'G';
  readonly eligiblePositions: readonly ['G'];
}

export type PlayerIdentity = SkaterPlayerIdentity | GoaliePlayerIdentity;
export type Player = PlayerIdentity;

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

export interface CardVisualMetadata {
  readonly treatment: 'neutral-placeholder' | 'approved-local-asset';
  readonly accent: string;
  readonly frame: CardTier;
}

interface CardVersionBase {
  readonly id: string;
  readonly playerId: string;
  readonly teamId: string;
  readonly setId: string;
  readonly cardType: CardType;
  readonly cardTier: CardTier;
  readonly overall: number;
  readonly abilities: readonly string[];
  readonly price: number;
  readonly marketAvailability: MarketAvailability;
  readonly availableFrom?: string;
  readonly availableTo?: string;
  readonly isPermanent: boolean;
  readonly imageReference: string;
  readonly visualMetadata: CardVisualMetadata;
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

export interface StarterSquadValidationMetadata {
  readonly excludedTopBasePlayerIds: readonly string[];
  readonly sourceRosterStatuses: readonly SourceRosterStatus[];
  readonly requiresManualReview: boolean;
  readonly manualReviewReasons: readonly string[];
}

export interface StarterSquad {
  readonly teamId: string;
  readonly cards: readonly string[];
  readonly lineup: Readonly<Record<HockeyPosition, string>>;
  readonly averageOverall: number;
  readonly validationMetadata: StarterSquadValidationMetadata;
}

export interface CardCatalog {
  readonly players: readonly Player[];
  readonly cards: readonly CardVersion[];
}

export interface ContentCatalog extends CardCatalog {
  readonly teams: readonly Team[];
  readonly starterSquads: readonly StarterSquad[];
}

export interface ResolvedCard {
  readonly player: Player;
  readonly card: CardVersion;
}
