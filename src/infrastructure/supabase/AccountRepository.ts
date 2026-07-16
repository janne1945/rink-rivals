import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import type { AiDifficulty, BattleSituation, CardRoundScore, RoundWinner } from "../../domain/battle";
import type { GameMode, LineupSlot } from "../../domain/lineups";
import type { Database } from "./database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserCardRow = Database["public"]["Tables"]["user_cards"]["Row"];
type LineupRow = Database["public"]["Tables"]["lineups"]["Row"];
type LineupSlotRow = Database["public"]["Tables"]["lineup_slots"]["Row"];
type ObjectiveProgressRow = Database["public"]["Tables"]["objective_progress"]["Row"];
type RivalryRoadRow = Database["public"]["Tables"]["rivalry_road_progress"]["Row"];

export interface AccountProfile {
  readonly id: string;
  readonly displayName: string | null;
  readonly credits: number;
  readonly selectedTeamId: string | null;
  readonly starterClaimedAt: string | null;
  readonly onboardingCompleted: boolean;
  readonly completedMatches: number;
}

export interface AccountObjectiveProgress {
  readonly objectiveId: string;
  readonly periodKey: string;
  readonly current: number;
  readonly target: number;
  readonly completedModes: readonly string[];
  readonly completedAt: string | null;
}

export interface AccountRivalryRoadProgress {
  readonly currentStepIndex: number;
  readonly completedStepIds: readonly string[];
  readonly status: "in-progress" | "choice-pending" | "complete";
  readonly selectedCardId: string | null;
}

export interface SettleMatchInput {
  readonly clientMatchId: string;
}

export interface AbandonMatchInput {
  readonly clientMatchId: string;
}

export interface AbandonMatchResult {
  readonly status: "abandoned" | "already-abandoned" | "already-settled";
}

export interface SettleMatchResult {
  readonly status: "settled" | "already-settled";
  readonly matchId: string;
  readonly rewardCredits: number;
  readonly credits: number;
  readonly completedMatches: number;
}

export interface SeasonReward {
  readonly tier: number;
  readonly xpRequired: number;
  readonly rewardType: "credits" | "emblem" | "banner" | "title" | "broadcast-sting" | "card";
  readonly label: string;
  readonly description: string;
  readonly amount: number | null;
  readonly cardId: string | null;
  readonly cosmeticSlug: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly unlocked: boolean;
  readonly claimed: boolean;
  readonly claimedAt: string | null;
}

export interface SeasonLockerState {
  readonly status: "active" | "upcoming" | "ended" | "unavailable";
  readonly serverTime: string;
  readonly season: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly startsAt: string;
    readonly endsAt: string;
  } | null;
  readonly xp: number;
  readonly faceoffMatches: number;
  readonly arenaMatches: number;
  readonly rewards: readonly SeasonReward[];
}

export interface ClaimSeasonRewardInput {
  readonly seasonId: string;
  readonly tier: number;
  readonly clientRequestId: string;
}

export interface ClaimSeasonRewardResult {
  readonly status: "claimed" | "already-claimed";
  readonly seasonId: string;
  readonly tier: number;
  readonly reward: Readonly<Record<string, unknown>>;
  readonly claimedAt: string;
  readonly credits: number;
}

export interface StartArenaMatchInput {
  readonly clientMatchId: string;
  readonly mode: GameMode;
}

export type LiveRivalryRoomStatus = "waiting" | "active" | "completed" | "cancelled" | "expired";

export interface LiveRivalryRound {
  readonly roundIndex: number;
  readonly situationId: string;
  readonly playerCardId: string;
  readonly playerSlot: LineupSlot;
  readonly playerScore: number;
  readonly opponentCardId: string;
  readonly opponentSlot: LineupSlot;
  readonly opponentScore: number;
  readonly winner: "player" | "opponent";
  readonly tieBreaker: import("../../domain/battle").RoundTieBreaker;
  readonly transcript: {
    readonly situation: BattleSituation;
    readonly player: CardRoundScore;
    readonly opponent: CardRoundScore;
  };
  readonly resolvedAt: string;
}

export interface LiveRivalryRoomState {
  readonly serverTime: string;
  readonly roomId: string;
  readonly roomCode: string;
  readonly topic: string;
  readonly status: LiveRivalryRoomStatus;
  readonly stateVersion: number;
  readonly mode: GameMode;
  readonly currentRound: number;
  readonly situations: readonly BattleSituation[];
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string;
  readonly rematchOf: string | null;
  readonly me: {
    readonly userId: string;
    readonly role: "host" | "guest";
    readonly displayLabel: string;
    readonly lineupId: string;
    readonly lineupName: string;
    readonly lineup: MatchLineupSnapshot;
    readonly ready: boolean;
    readonly locked: boolean;
  };
  readonly opponent: {
    readonly userId: string;
    readonly role: "host" | "guest";
    readonly displayLabel: string;
    readonly lineupId: string;
    readonly lineupName: string;
    readonly ready: boolean;
    readonly online: boolean;
    readonly locked: boolean;
  } | null;
  readonly rounds: readonly LiveRivalryRound[];
  readonly result: {
    readonly outcome: "win" | "loss";
    readonly playerWins: number;
    readonly opponentWins: number;
    readonly winnerUserId: string;
  } | null;
  readonly headToHead: {
    readonly matches: number;
    readonly playerWins: number;
    readonly opponentWins: number;
  };
  readonly rewards: {
    readonly credits: 0;
    readonly seasonXp: 0;
    readonly cards: 0;
    readonly objectives: 0;
  };
}

export interface CreateLiveRivalryRoomInput {
  readonly clientRequestId: string;
  readonly mode: GameMode;
  readonly lineupId: string;
}

export interface JoinLiveRivalryRoomInput {
  readonly roomCode: string;
  readonly clientRequestId: string;
  readonly lineupId: string;
}

export interface LockLiveRivalryChoiceInput {
  readonly roomId: string;
  readonly roundIndex: number;
  readonly cardId: string;
  readonly clientRequestId: string;
}

export interface AccountMarketEvent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly visualMetadata: Readonly<Record<string, unknown>>;
}

export interface AccountMarketOffer {
  readonly id: string;
  readonly cardId: string;
  readonly source: "base_market" | "event_shop";
  readonly regularPrice: number;
  readonly price: number;
  readonly eventId: string | null;
  readonly placement: "standard" | "spotlight";
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly ownedQuantity: number;
}

export interface AccountMarketState {
  readonly serverTime: string;
  readonly currentEvent: AccountMarketEvent | null;
  readonly offers: readonly AccountMarketOffer[];
}

export interface PurchaseCardInput {
  readonly clientRequestId: string;
  readonly offerId: string;
}

export interface PurchaseCardResult {
  readonly status: "purchased" | "already-processed";
  readonly requestId: string;
  readonly offerId: string;
  readonly cardId: string;
  readonly price: number;
  readonly credits: number;
  readonly quantity: number;
  readonly purchasedAt: string;
}

export interface SaveLineupInput {
  readonly lineupId: string | null;
  readonly name: string;
  readonly mode: GameMode;
  readonly slots: Readonly<Record<LineupSlot, string>>;
}

export interface LineupMutationResult {
  readonly status: "saved" | "activated";
  readonly lineup: AccountLineup;
}

export interface ClaimRivalryRewardInput {
  readonly clientRequestId: string;
  readonly cardId: string;
}

export interface ClaimRivalryRewardResult {
  readonly status: "claimed" | "already-claimed";
  readonly requestId: string;
  readonly cardId: string;
  readonly quantity: number;
  readonly claimedAt: string;
}

export interface StartMatchInput {
  readonly clientMatchId: string;
  readonly mode: GameMode;
  readonly difficulty: "rookie" | "pro" | "elite";
}

export interface MatchLineupSnapshot {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly slots: Readonly<Record<LineupSlot, string>>;
}

export interface StartMatchResult {
  readonly status: "started" | "already-started";
  readonly clientMatchId: string;
  readonly seed: string;
  readonly opponentId: string;
  readonly opponent: {
    readonly id: string;
    readonly name: string;
    readonly mode: GameMode;
    readonly slots: Readonly<Record<LineupSlot, string>>;
  };
  readonly lineup: MatchLineupSnapshot;
  readonly situations: readonly BattleSituation[];
  readonly rounds: readonly PlayMatchRoundResult[];
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
}

export interface PlayMatchRoundInput {
  readonly clientMatchId: string;
  readonly roundIndex: number;
  readonly playerCardId: string;
  readonly clientRequestId: string;
}

export interface PlayMatchRoundResult {
  readonly status: "played" | "already-played";
  readonly clientMatchId: string;
  readonly roundIndex: number;
  readonly situationId: string;
  readonly playerCardId: string;
  readonly playerSlot: LineupSlot;
  readonly playerScore: number;
  readonly opponentCardId: string;
  readonly opponentSlot: LineupSlot;
  readonly opponentScore: number;
  readonly winner: RoundWinner;
  readonly tieBreaker: import("../../domain/battle").RoundTieBreaker;
  readonly transcript: {
    readonly situation: BattleSituation;
    readonly player: CardRoundScore;
    readonly opponent: CardRoundScore;
  };
}

export type RivalryChallengeStatus = "active" | "expired" | "revoked" | "missing";
export type RivalryChallengeSourceKind = "ai-match" | "ghost-challenge";

export interface PublicRivalryChallenge {
  readonly status: RivalryChallengeStatus;
  readonly slug: string | null;
  readonly creatorLabel: string | null;
  readonly mode: GameMode | null;
  readonly difficulty: AiDifficulty | null;
  readonly challengeStrength: number | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
}

export interface CreateRivalryChallengeInput {
  readonly clientRequestId: string;
  readonly sourceClientMatchId: string;
  readonly sourceKind: RivalryChallengeSourceKind;
}

export interface CreateRivalryChallengeResult {
  readonly status: "created" | "already-created";
  readonly challengeId: string;
  readonly slug: string;
  readonly expiresAt: string;
  readonly challengeStatus: Exclude<RivalryChallengeStatus, "missing">;
}

export interface StartRivalryChallengeInput {
  readonly slug: string;
  readonly clientMatchId: string;
  readonly lineupId: string;
}

export interface SettleRivalryChallengeResult {
  readonly status: "settled" | "already-settled";
  readonly challengeId: string;
  readonly attemptId: string;
  readonly outcome: "win" | "loss";
  readonly playerWins: number;
  readonly ghostWins: number;
}

export interface RivalryChallengeSummary {
  readonly slug: string;
  readonly creatorLabel: string;
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly challengeStrength: number;
  readonly status: Exclude<RivalryChallengeStatus, "missing">;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly attempts: number;
  readonly completed: number;
  readonly ghostDefenses: number;
  readonly challengerWins: number;
}

export interface AccountCard {
  readonly cardId: string;
  readonly quantity: number;
  readonly acquiredAt: string;
}

export interface AccountLineup {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly isActive: boolean;
  readonly slots: Readonly<Partial<Record<LineupSlot, string>>>;
}

export interface AccountRepository {
  loadProfile(): Promise<AccountProfile>;
  loadOwnCards(): Promise<readonly AccountCard[]>;
  loadLineups(): Promise<readonly AccountLineup[]>;
  loadLineup(lineupId?: string): Promise<AccountLineup | null>;
  loadObjectiveProgress(): Promise<readonly AccountObjectiveProgress[]>;
  loadRivalryRoadProgress(): Promise<AccountRivalryRoadProgress>;
  loadMarketState(): Promise<AccountMarketState>;
  claimStarterTeam(selectedTeamId: string): Promise<AccountLineup>;
  purchaseCard(input: PurchaseCardInput): Promise<PurchaseCardResult>;
  saveLineup(input: SaveLineupInput): Promise<LineupMutationResult>;
  activateLineup(lineupId: string): Promise<LineupMutationResult>;
  claimRivalryReward(input: ClaimRivalryRewardInput): Promise<ClaimRivalryRewardResult>;
  startMatch(input: StartMatchInput): Promise<StartMatchResult>;
  playMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult>;
  settleMatch(input: SettleMatchInput): Promise<SettleMatchResult>;
  abandonMatch(input: AbandonMatchInput): Promise<AbandonMatchResult>;
  loadSeasonLocker(): Promise<SeasonLockerState>;
  claimSeasonReward(input: ClaimSeasonRewardInput): Promise<ClaimSeasonRewardResult>;
  startArenaMatch(input: StartArenaMatchInput): Promise<StartMatchResult>;
  playArenaMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult>;
  settleArenaMatch(input: SettleMatchInput): Promise<SettleMatchResult>;
  abandonArenaMatch(input: AbandonMatchInput): Promise<AbandonMatchResult>;
  loadLiveRivalryRoom(roomId?: string): Promise<LiveRivalryRoomState | null>;
  createLiveRivalryRoom(input: CreateLiveRivalryRoomInput): Promise<LiveRivalryRoomState>;
  joinLiveRivalryRoom(input: JoinLiveRivalryRoomInput): Promise<LiveRivalryRoomState>;
  setLiveRivalryReady(roomId: string, ready: boolean, clientRequestId: string): Promise<LiveRivalryRoomState>;
  lockLiveRivalryChoice(input: LockLiveRivalryChoiceInput): Promise<LiveRivalryRoomState>;
  leaveLiveRivalryRoom(roomId: string, clientRequestId: string): Promise<LiveRivalryRoomState>;
  createLiveRivalryRematch(previousRoomId: string, clientRequestId: string, lineupId: string): Promise<LiveRivalryRoomState>;
  subscribeToLiveRivalryRoom(topic: string, onUpdate: (stateVersion: number) => void, onStatus?: (status: string) => void): () => void;
  loadPublicRivalryChallenge(slug: string): Promise<PublicRivalryChallenge>;
  createRivalryChallenge(input: CreateRivalryChallengeInput): Promise<CreateRivalryChallengeResult>;
  startRivalryChallenge(input: StartRivalryChallengeInput): Promise<StartMatchResult>;
  playRivalryChallengeRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult>;
  settleRivalryChallenge(input: SettleMatchInput): Promise<SettleRivalryChallengeResult>;
  abandonRivalryChallenge(input: AbandonMatchInput): Promise<AbandonMatchResult>;
  revokeRivalryChallenge(slug: string): Promise<void>;
  listRivalryChallenges(): Promise<readonly RivalryChallengeSummary[]>;
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

function toProfile(row: ProfileRow): AccountProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    credits: row.credits,
    selectedTeamId: row.favorite_team_id,
    starterClaimedAt: row.starter_claimed_at,
    onboardingCompleted: row.onboarding_completed,
    completedMatches: row.completed_matches,
  };
}

function toCard(row: UserCardRow): AccountCard {
  return {
    cardId: row.card_id,
    quantity: row.quantity,
    acquiredAt: row.acquired_at,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function textField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Supabase returned an invalid ${label}.`);
  return value;
}

function dateField(value: unknown, label: string): string {
  const parsed = textField(value, label);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`Supabase returned an invalid ${label}.`);
  return parsed;
}

function nonNegativeIntegerField(value: unknown, label: string): number {
  const parsed = numberField(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Supabase returned an invalid ${label}.`);
  return parsed;
}

function booleanField(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Supabase returned an invalid ${label}.`);
  return value;
}

function nullableTextField(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : textField(value, label);
}

function nullableDateField(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : dateField(value, label);
}

function modeField(value: unknown): GameMode {
  if (!["nhl-circuit", "pwhl-circuit", "open-ice"].includes(String(value))) {
    throw new Error("Supabase returned an invalid lineup mode.");
  }
  return value as GameMode;
}

function difficultyField(value: unknown): AiDifficulty {
  if (!['rookie', 'pro', 'elite'].includes(String(value))) {
    throw new Error("Supabase returned an invalid match difficulty.");
  }
  return value as AiDifficulty;
}

function challengeStatusField(value: unknown): Exclude<RivalryChallengeStatus, "missing"> {
  if (!['active', 'expired', 'revoked'].includes(String(value))) {
    throw new Error("Supabase returned an invalid challenge status.");
  }
  return value as Exclude<RivalryChallengeStatus, "missing">;
}

const lineupSlots = ["LW", "C", "RW", "LD", "RD", "G"] as const;

function lineupSlotField(value: unknown, label: string): LineupSlot {
  if (!lineupSlots.includes(value as LineupSlot)) throw new Error(`Supabase returned an invalid ${label}.`);
  return value as LineupSlot;
}

function lineupSlotRecord(value: unknown, label: string): Readonly<Record<LineupSlot, string>> {
  const raw = record(value, label);
  return Object.fromEntries(lineupSlots.map((slot) => [slot, textField(raw[slot], `${label} ${slot}`)])) as unknown as Record<LineupSlot, string>;
}

function scoreField(value: unknown, label: string): CardRoundScore {
  const score = record(value, label);
  return {
    value: nonNegativeIntegerField(score.value, `${label} value`),
    overall: nonNegativeIntegerField(score.overall, `${label} overall`),
  };
}

const legacyQuartettCategories: Readonly<Record<string, Readonly<{ id: string; name: string; description: string; attribute: string }>>> = {
  "transition-rush": { id: "skater-speed", name: "Speed", description: "Higher Speed wins this round.", attribute: "speed" },
  "cycle-pressure": { id: "skater-shooting", name: "Shooting", description: "Higher Shooting wins this round.", attribute: "shooting" },
  "blue-line-command": { id: "skater-defense", name: "Defense", description: "Higher Defense wins this round.", attribute: "defense" },
  "late-game-shift": { id: "skater-clutch", name: "Clutch", description: "Higher Clutch wins this round.", attribute: "clutch" },
  "crease-under-fire": { id: "goalie-reflexes", name: "Reflexes", description: "Higher Reflexes wins this round.", attribute: "reflexes" },
};

function situationField(value: unknown): BattleSituation {
  const situation = record(value, "battle situation");
  const role = situation.role;
  if (role !== "skater" && role !== "goalie") throw new Error("Supabase returned an invalid battle situation role.");
  if (!Array.isArray(situation.eligible_slots)) throw new Error("Supabase returned invalid eligible battle slots.");
  const eligibleSlots = situation.eligible_slots.map((slot) => lineupSlotField(slot, "eligible battle slot"));
  const rawId = textField(situation.id, "battle situation id");
  const legacy = legacyQuartettCategories[rawId];
  const id = legacy?.id ?? rawId;
  const attribute = typeof situation.attribute === "string" ? situation.attribute : legacy?.attribute;
  if (!attribute) throw new Error("Supabase returned a battle round without a visible category attribute.");
  return {
    id,
    name: legacy?.name ?? textField(situation.name, "battle situation name"),
    description: legacy?.description ?? (typeof situation.description === "string" ? situation.description : ""),
    role,
    eligibleSlots,
    attribute,
  } as BattleSituation;
}

function matchRoundField(value: unknown): PlayMatchRoundResult {
  const payload = record(value, "match round result");
  const status = payload.status;
  if (status !== "played" && status !== "already-played") throw new Error("Supabase returned an invalid match round status.");
  const winner = payload.winner;
  if (winner !== "player" && winner !== "opponent" && winner !== "tie") throw new Error("Supabase returned an invalid round winner.");
  const transcript = record(payload.transcript, "match round transcript");
  const tieBreaker = payload.tie_breaker ?? transcript.tie_breaker;
  if (tieBreaker !== "category" && tieBreaker !== "overall" && tieBreaker !== "match-seed") {
    throw new Error("Supabase returned an invalid round tie-breaker.");
  }
  const roundIndex = numberField(payload.round_index, "round index");
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 4) throw new Error("Supabase returned an invalid round index.");
  return {
    status,
    clientMatchId: textField(payload.client_match_id, "round client match id"),
    roundIndex,
    situationId: legacyQuartettCategories[textField(payload.situation_id, "round situation id")]?.id
      ?? textField(payload.situation_id, "round situation id"),
    playerCardId: textField(payload.player_card_id, "round player card id"),
    playerSlot: lineupSlotField(payload.player_slot, "round player slot"),
    playerScore: numberField(payload.player_score, "round player score"),
    opponentCardId: textField(payload.opponent_card_id, "round opponent card id"),
    opponentSlot: lineupSlotField(payload.opponent_slot, "round opponent slot"),
    opponentScore: numberField(payload.opponent_score, "round opponent score"),
    winner,
    tieBreaker,
    transcript: {
      situation: situationField(transcript.situation),
      player: scoreField(transcript.player, "player round score"),
      opponent: scoreField(transcript.opponent, "opponent round score"),
    },
  };
}

function abandonMatchResultField(value: unknown): AbandonMatchResult {
  const payload = record(value, "match abandonment result");
  if (payload.status !== "abandoned" && payload.status !== "already-abandoned" && payload.status !== "already-settled") {
    throw new Error("Supabase returned an invalid match abandonment status.");
  }
  return { status: payload.status };
}

function startMatchResultField(value: unknown): StartMatchResult {
  const payload = record(value, "match start result");
  const difficulty = difficultyField(payload.difficulty);
  const status = payload.status;
  if (status !== "started" && status !== "already-started") {
    throw new Error("Supabase returned an invalid match start status.");
  }
  const opponent = record(payload.opponent, "match opponent");
  const lineup = record(payload.lineup, "match lineup");
  if (!Array.isArray(payload.situations) || payload.situations.length !== 5) {
    throw new Error("Supabase returned an invalid match situation deck.");
  }
  if (!Array.isArray(payload.rounds) || payload.rounds.length > 5) {
    throw new Error("Supabase returned invalid resumed match rounds.");
  }
  return {
    status,
    clientMatchId: textField(payload.client_match_id, "client match id"),
    seed: textField(payload.seed, "match seed"),
    opponentId: textField(payload.opponent_id, "opponent id"),
    opponent: {
      id: textField(opponent.id, "opponent snapshot id"),
      name: textField(opponent.name, "opponent snapshot name"),
      mode: modeField(opponent.mode),
      slots: lineupSlotRecord(opponent.slots, "opponent lineup slots"),
    },
    lineup: {
      id: textField(lineup.id, "match lineup snapshot id"),
      name: textField(lineup.name, "match lineup snapshot name"),
      mode: modeField(lineup.mode),
      slots: lineupSlotRecord(lineup.slots, "match lineup snapshot slots"),
    },
    situations: payload.situations.map(situationField),
    rounds: payload.rounds.map(matchRoundField),
    mode: modeField(payload.mode),
    difficulty,
  };
}

function seasonLockerField(value: unknown): SeasonLockerState {
  const payload = record(value, "Season Locker");
  if (payload.status === "unavailable") {
    return {
      status: "unavailable",
      serverTime: dateField(payload.server_time, "Season server time"),
      season: null,
      xp: 0,
      faceoffMatches: 0,
      arenaMatches: 0,
      rewards: [],
    };
  }
  if (!["active", "upcoming", "ended"].includes(String(payload.status))) {
    throw new Error("Supabase returned an invalid Season status.");
  }
  const season = record(payload.season, "Season");
  if (!Array.isArray(payload.rewards) || payload.rewards.length !== 30) {
    throw new Error("Supabase returned an incomplete Season reward path.");
  }
  const rewardTypes = ["credits", "emblem", "banner", "title", "broadcast-sting", "card"] as const;
  const rewards = payload.rewards.map((value) => {
    const reward = record(value, "Season reward");
    if (!rewardTypes.includes(reward.reward_type as typeof rewardTypes[number])) {
      throw new Error("Supabase returned an invalid Season reward type.");
    }
    return {
      tier: nonNegativeIntegerField(reward.tier, "Season reward tier"),
      xpRequired: nonNegativeIntegerField(reward.xp_required, "Season reward XP"),
      rewardType: reward.reward_type as SeasonReward["rewardType"],
      label: textField(reward.label, "Season reward label"),
      description: typeof reward.description === "string" ? reward.description : "",
      amount: reward.amount === null ? null : nonNegativeIntegerField(reward.amount, "Season reward amount"),
      cardId: nullableTextField(reward.card_id, "Season reward card"),
      cosmeticSlug: nullableTextField(reward.cosmetic_slug, "Season reward cosmetic"),
      metadata: record(reward.metadata ?? {}, "Season reward metadata"),
      unlocked: booleanField(reward.unlocked, "Season reward unlock state"),
      claimed: booleanField(reward.claimed, "Season reward claim state"),
      claimedAt: nullableDateField(reward.claimed_at, "Season reward claim time"),
    };
  });
  if (rewards.some((reward, index) => reward.tier !== index + 1 || (index > 0 && reward.xpRequired <= rewards[index - 1]!.xpRequired))) {
    throw new Error("Supabase returned an unordered Season reward path.");
  }
  return {
    status: payload.status as SeasonLockerState["status"],
    serverTime: dateField(payload.server_time, "Season server time"),
    season: {
      id: textField(season.id, "Season id"),
      name: textField(season.name, "Season name"),
      description: typeof season.description === "string" ? season.description : "",
      startsAt: dateField(season.starts_at, "Season start"),
      endsAt: dateField(season.ends_at, "Season end"),
    },
    xp: nonNegativeIntegerField(payload.xp, "Season XP"),
    faceoffMatches: nonNegativeIntegerField(payload.faceoff_matches, "Season Faceoff count"),
    arenaMatches: nonNegativeIntegerField(payload.arena_matches, "Season Arena count"),
    rewards,
  };
}

function liveRivalryRoomField(value: unknown): LiveRivalryRoomState {
  const payload = record(value, "Live Ghost room");
  if (!["waiting", "active", "completed", "cancelled", "expired"].includes(String(payload.status))) {
    throw new Error("Supabase returned an invalid Live room status.");
  }
  if (!Array.isArray(payload.situations) || payload.situations.length !== 5) {
    throw new Error("Supabase returned invalid Live room categories.");
  }
  const situations = payload.situations.map(situationField);
  if (!Array.isArray(payload.rounds) || payload.rounds.length > 5) {
    throw new Error("Supabase returned invalid Live room rounds.");
  }
  const me = record(payload.me, "Live room player");
  const lineup = record(me.lineup, "Live room lineup");
  const opponentValue = payload.opponent;
  const opponent = opponentValue === null ? null : record(opponentValue, "Live room opponent");
  const resultValue = payload.result;
  const result = resultValue === null ? null : record(resultValue, "Live room result");
  const h2h = record(payload.head_to_head, "Live head-to-head");
  const rewards = record(payload.rewards, "Live reward guardrail");
  const roleField = (role: unknown): "host" | "guest" => {
    if (role !== "host" && role !== "guest") throw new Error("Supabase returned an invalid Live player role.");
    return role;
  };
  const rounds = payload.rounds.map((value): LiveRivalryRound => {
    const round = record(value, "Live round");
    const winner = round.winner;
    if (winner !== "player" && winner !== "opponent") throw new Error("Supabase returned an invalid Live round winner.");
    const tieBreaker = round.tie_breaker;
    if (tieBreaker !== "category" && tieBreaker !== "overall" && tieBreaker !== "match-seed") {
      throw new Error("Supabase returned an invalid Live tie-breaker.");
    }
    const transcript = record(round.transcript, "Live round transcript");
    return {
      roundIndex: nonNegativeIntegerField(round.round_index, "Live round index"),
      situationId: textField(round.situation_id, "Live situation id"),
      playerCardId: textField(round.player_card_id, "Live player card"),
      playerSlot: lineupSlotField(round.player_slot, "Live player slot"),
      playerScore: nonNegativeIntegerField(round.player_score, "Live player score"),
      opponentCardId: textField(round.opponent_card_id, "Live opponent card"),
      opponentSlot: lineupSlotField(round.opponent_slot, "Live opponent slot"),
      opponentScore: nonNegativeIntegerField(round.opponent_score, "Live opponent score"),
      winner,
      tieBreaker,
      transcript: {
        situation: situationField(transcript.situation),
        player: scoreField(transcript.player, "Live player score detail"),
        opponent: scoreField(transcript.opponent, "Live opponent score detail"),
      },
      resolvedAt: dateField(round.resolved_at, "Live resolution time"),
    };
  });
  const currentRound = nonNegativeIntegerField(payload.current_round, "Live current round");
  if (currentRound > 5) throw new Error("Supabase returned an invalid Live current round.");
  if (rounds.length !== currentRound || rounds.some((round, index) => round.roundIndex !== index || round.situationId !== situations[index]?.id)) {
    throw new Error("Supabase returned an inconsistent Live round sequence.");
  }
  if (payload.status === "active" && (opponent === null || currentRound >= 5)) {
    throw new Error("Supabase returned an inconsistent active Live room.");
  }
  if (payload.status === "completed" && (opponent === null || result === null)) {
    throw new Error("Supabase returned an incomplete Live result.");
  }
  if (payload.status !== "completed" && result !== null) {
    throw new Error("Supabase returned a premature Live result.");
  }
  const roomId = textField(payload.room_id, "Live room id");
  const roomCode = textField(payload.room_code, "Live room code");
  const topic = textField(payload.topic, "Live room topic");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) || topic !== `live-rivalry:${roomId}`) {
    throw new Error("Supabase returned an invalid Live room identity.");
  }
  const roomMode = modeField(payload.mode);
  const lineupMode = modeField(lineup.mode);
  if (roomMode !== lineupMode) throw new Error("Supabase returned a mismatched Live lineup mode.");
  const liveRewards = {
    credits: numberField(rewards.credits, "Live Credits guardrail"),
    seasonXp: numberField(rewards.season_xp, "Live XP guardrail"),
    cards: numberField(rewards.cards, "Live cards guardrail"),
    objectives: numberField(rewards.objectives, "Live objectives guardrail"),
  };
  if (Object.values(liveRewards).some((reward) => reward !== 0)) {
    throw new Error("Supabase violated the zero-reward contract for a private Live challenge.");
  }
  return {
    serverTime: dateField(payload.server_time, "Live server time"),
    roomId,
    roomCode,
    topic,
    status: payload.status as LiveRivalryRoomStatus,
    stateVersion: nonNegativeIntegerField(payload.state_version, "Live state version"),
    mode: roomMode,
    currentRound,
    situations,
    createdAt: dateField(payload.created_at, "Live room creation time"),
    startedAt: nullableDateField(payload.started_at, "Live room start time"),
    completedAt: nullableDateField(payload.completed_at, "Live room completion time"),
    expiresAt: dateField(payload.expires_at, "Live room expiry"),
    rematchOf: nullableTextField(payload.rematch_of, "Live rematch room"),
    me: {
      userId: textField(me.user_id, "Live player id"),
      role: roleField(me.role),
      displayLabel: textField(me.display_label, "Live player label"),
      lineupId: textField(me.lineup_id, "Live lineup id"),
      lineupName: textField(me.lineup_name, "Live lineup name"),
      lineup: {
        id: textField(lineup.id, "Live lineup snapshot id"),
        name: textField(lineup.name, "Live lineup snapshot name"),
        mode: lineupMode,
        slots: lineupSlotRecord(lineup.slots, "Live lineup slots"),
      },
      ready: booleanField(me.ready, "Live ready state"),
      locked: booleanField(me.locked, "Live lock state"),
    },
    opponent: opponent === null ? null : {
      userId: textField(opponent.user_id, "Live opponent id"),
      role: roleField(opponent.role),
      displayLabel: textField(opponent.display_label, "Live opponent label"),
      lineupId: textField(opponent.lineup_id, "Live opponent lineup id"),
      lineupName: textField(opponent.lineup_name, "Live opponent lineup name"),
      ready: booleanField(opponent.ready, "Live opponent ready state"),
      online: booleanField(opponent.online, "Live opponent online state"),
      locked: booleanField(opponent.locked, "Live opponent lock state"),
    },
    rounds,
    result: result === null ? null : (() => {
      if (result.outcome !== "win" && result.outcome !== "loss") throw new Error("Supabase returned an invalid Live outcome.");
      return {
        outcome: result.outcome,
        playerWins: nonNegativeIntegerField(result.player_wins, "Live player wins"),
        opponentWins: nonNegativeIntegerField(result.opponent_wins, "Live opponent wins"),
        winnerUserId: textField(result.winner_user_id, "Live winner id"),
      };
    })(),
    headToHead: {
      matches: nonNegativeIntegerField(h2h.matches, "Live head-to-head matches"),
      playerWins: nonNegativeIntegerField(h2h.player_wins, "Live head-to-head player wins"),
      opponentWins: nonNegativeIntegerField(h2h.opponent_wins, "Live head-to-head opponent wins"),
    },
    rewards: liveRewards as LiveRivalryRoomState["rewards"],
  };
}

type UntypedRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async loadProfile(): Promise<AccountProfile> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .single();
    return toProfile(requireData(data, error));
  }

  async loadObjectiveProgress(): Promise<readonly AccountObjectiveProgress[]> {
    const { data, error } = await this.client
      .from("objective_progress")
      .select("*")
      .order("updated_at", { ascending: false });
    return requireData(data, error).map((row: ObjectiveProgressRow) => ({
      objectiveId: row.objective_id,
      periodKey: row.period_key,
      current: row.current,
      target: row.target,
      completedModes: row.completed_modes,
      completedAt: row.completed_at,
    }));
  }

  async loadRivalryRoadProgress(): Promise<AccountRivalryRoadProgress> {
    const { data, error } = await this.client
      .from("rivalry_road_progress")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as RivalryRoadRow | null;
    if (!row) return { currentStepIndex: 0, completedStepIds: [], status: "in-progress", selectedCardId: null };
    return {
      currentStepIndex: row.current_step_index,
      completedStepIds: row.completed_step_ids,
      status: row.status as AccountRivalryRoadProgress["status"],
      selectedCardId: row.selected_card_id,
    };
  }

  async loadOwnCards(): Promise<readonly AccountCard[]> {
    const { data, error } = await this.client
      .from("user_cards")
      .select("*")
      .order("acquired_at", { ascending: true });
    return requireData(data, error).map(toCard);
  }

  async loadLineups(): Promise<readonly AccountLineup[]> {
    const { data: lineups, error: lineupError } = await this.client
      .from("lineups")
      .select("*")
      .order("created_at", { ascending: true });
    const lineupRows = requireData(lineups, lineupError);
    if (lineupRows.length === 0) return [];

    const { data: slots, error: slotsError } = await this.client
      .from("lineup_slots")
      .select("*")
      .in("lineup_id", lineupRows.map(({ id }) => id));
    const slotRows = requireData(slots, slotsError);
    return lineupRows.map((lineup) => this.toLineup(
      lineup,
      slotRows.filter((slot) => slot.lineup_id === lineup.id),
    ));
  }

  async loadLineup(lineupId?: string): Promise<AccountLineup | null> {
    let query = this.client.from("lineups").select("*");
    query = lineupId
      ? query.eq("id", lineupId)
      : query.eq("is_active", true).limit(1);

    const { data: lineup, error: lineupError } = await query.maybeSingle();
    if (lineupError) throw new Error(lineupError.message);
    if (!lineup) return null;

    const { data: slots, error: slotsError } = await this.client
      .from("lineup_slots")
      .select("*")
      .eq("lineup_id", lineup.id);
    const slotRows = requireData(slots, slotsError);
    return this.toLineup(lineup, slotRows);
  }

  async claimStarterTeam(selectedTeamId: string): Promise<AccountLineup> {
    const { data: lineupId, error } = await this.client.rpc(
      "claim_starter_team",
      { selected_team_id: selectedTeamId },
    );
    const id = requireData(lineupId, error);
    const lineup = await this.loadLineup(id);
    if (!lineup) throw new Error("Claimed starter lineup could not be loaded.");
    return lineup;
  }

  async loadMarketState(): Promise<AccountMarketState> {
    const payload = record(await this.callRpc("get_market_state"), "market state");
    const eventValue = payload.current_event;
    const currentEvent = eventValue === null || eventValue === undefined
      ? null
      : (() => {
          const event = record(eventValue, "current market event");
          return {
            id: textField(event.id, "event id"),
            name: textField(event.name, "event name"),
            description: typeof event.description === "string" ? event.description : "",
            startsAt: textField(event.starts_at, "event start"),
            endsAt: textField(event.ends_at, "event end"),
            visualMetadata: event.visual_metadata && typeof event.visual_metadata === "object" && !Array.isArray(event.visual_metadata)
              ? event.visual_metadata as Record<string, unknown>
              : {},
          };
        })();
    const offers = Array.isArray(payload.offers) ? payload.offers : [];
    return {
      serverTime: textField(payload.server_time, "market server time"),
      currentEvent,
      offers: offers.map((value) => {
        const offer = record(value, "market offer");
        if (offer.source !== "base_market" && offer.source !== "event_shop") {
          throw new Error("Supabase returned an invalid market offer source.");
        }
        if (offer.placement !== "standard" && offer.placement !== "spotlight") {
          throw new Error("Supabase returned an invalid market offer placement.");
        }
        const startsAt = typeof offer.starts_at === "string" ? offer.starts_at : null;
        const endsAt = typeof offer.ends_at === "string" ? offer.ends_at : null;
        if (offer.source === "event_shop" && (
          startsAt === null
          || endsAt === null
          || !Number.isFinite(Date.parse(startsAt))
          || !Number.isFinite(Date.parse(endsAt))
          || Date.parse(startsAt) >= Date.parse(endsAt)
        )) {
          throw new Error("Supabase returned an invalid event offer window.");
        }
        return {
          id: textField(offer.offer_id, "offer id"),
          cardId: textField(offer.card_id, "offer card id"),
          source: offer.source,
          regularPrice: numberField(offer.regular_price ?? offer.price, "regular price"),
          price: numberField(offer.price, "offer price"),
          eventId: typeof offer.event_id === "string" ? offer.event_id : null,
          placement: offer.placement,
          startsAt,
          endsAt,
          ownedQuantity: numberField(offer.owned_quantity ?? 0, "owned quantity"),
        };
      }),
    };
  }

  async purchaseCard(input: PurchaseCardInput): Promise<PurchaseCardResult> {
    const payload = record(await this.callRpc("purchase_card", {
      client_request_id: input.clientRequestId,
      offer_id: input.offerId,
    }), "purchase result");
    const status = payload.status;
    if (status !== "purchased" && status !== "already-processed") {
      throw new Error("Supabase returned an invalid purchase status.");
    }
    return {
      status,
      requestId: textField(payload.request_id, "purchase request id"),
      offerId: textField(payload.offer_id, "purchase offer id"),
      cardId: textField(payload.card_id, "purchased card id"),
      price: numberField(payload.price, "purchase price"),
      credits: numberField(payload.credits, "credit balance"),
      quantity: numberField(payload.quantity, "owned quantity"),
      purchasedAt: textField(payload.purchased_at, "purchase timestamp"),
    };
  }

  async saveLineup(input: SaveLineupInput): Promise<LineupMutationResult> {
    const payload = record(await this.callRpc("save_lineup", {
      lineup_id: input.lineupId,
      name: input.name,
      mode: input.mode,
      slots: input.slots,
    }), "lineup save result");
    if (payload.status !== "saved") throw new Error("Supabase returned an invalid lineup save status.");
    return { status: "saved", lineup: this.toRpcLineup(payload.lineup) };
  }

  async activateLineup(lineupId: string): Promise<LineupMutationResult> {
    const payload = record(await this.callRpc("activate_lineup", { lineup_id: lineupId }), "lineup activation result");
    if (payload.status !== "activated") throw new Error("Supabase returned an invalid lineup activation status.");
    return { status: "activated", lineup: this.toRpcLineup(payload.lineup) };
  }

  async claimRivalryReward(input: ClaimRivalryRewardInput): Promise<ClaimRivalryRewardResult> {
    const payload = record(await this.callRpc("claim_rivalry_reward", {
      client_request_id: input.clientRequestId,
      card_id: input.cardId,
    }), "Rivalry Road claim result");
    const status = payload.status;
    if (status !== "claimed" && status !== "already-claimed") {
      throw new Error("Supabase returned an invalid Rivalry Road claim status.");
    }
    return {
      status,
      requestId: textField(payload.request_id, "reward request id"),
      cardId: textField(payload.card_id, "reward card id"),
      quantity: numberField(payload.quantity, "reward quantity"),
      claimedAt: textField(payload.claimed_at, "reward claim timestamp"),
    };
  }

  async startMatch(input: StartMatchInput): Promise<StartMatchResult> {
    return startMatchResultField(await this.callRpc("start_match", {
      client_match_id: input.clientMatchId,
      mode: input.mode,
      difficulty: input.difficulty,
    }));
  }

  async playMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult> {
    return matchRoundField(await this.callRpc("play_match_round", {
      client_match_id: input.clientMatchId,
      round_index: input.roundIndex,
      player_card_id: input.playerCardId,
      client_request_id: input.clientRequestId,
    }));
  }

  async loadPublicRivalryChallenge(slug: string): Promise<PublicRivalryChallenge> {
    const payload = record(await this.callRpc("get_public_rivalry_challenge", {
      challenge_slug: slug,
    }), "public challenge");
    if (payload.status === "missing") {
      return {
        status: "missing", slug: null, creatorLabel: null, mode: null,
        difficulty: null, challengeStrength: null, createdAt: null, expiresAt: null,
      };
    }
    return {
      status: challengeStatusField(payload.status),
      slug: textField(payload.slug, "challenge slug"),
      creatorLabel: textField(payload.creator_label, "challenge creator"),
      mode: modeField(payload.mode),
      difficulty: difficultyField(payload.difficulty),
      challengeStrength: nonNegativeIntegerField(payload.challenge_strength, "challenge strength"),
      createdAt: dateField(payload.created_at, "challenge creation time"),
      expiresAt: dateField(payload.expires_at, "challenge expiry time"),
    };
  }

  async createRivalryChallenge(input: CreateRivalryChallengeInput): Promise<CreateRivalryChallengeResult> {
    const payload = record(await this.callRpc("create_rivalry_challenge", {
      client_request_id: input.clientRequestId,
      source_client_match_id: input.sourceClientMatchId,
      source_kind: input.sourceKind,
    }), "challenge creation result");
    if (payload.status !== "created" && payload.status !== "already-created") {
      throw new Error("Supabase returned an invalid challenge creation status.");
    }
    return {
      status: payload.status,
      challengeId: textField(payload.challenge_id, "challenge id"),
      slug: textField(payload.slug, "challenge slug"),
      expiresAt: dateField(payload.expires_at, "challenge expiry time"),
      challengeStatus: challengeStatusField(payload.challenge_status),
    };
  }

  async startRivalryChallenge(input: StartRivalryChallengeInput): Promise<StartMatchResult> {
    return startMatchResultField(await this.callRpc("start_rivalry_challenge", {
      challenge_slug: input.slug,
      client_match_id: input.clientMatchId,
      lineup_id: input.lineupId,
    }));
  }

  async playRivalryChallengeRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult> {
    return matchRoundField(await this.callRpc("play_rivalry_challenge_round", {
      client_match_id: input.clientMatchId,
      round_index: input.roundIndex,
      player_card_id: input.playerCardId,
      client_request_id: input.clientRequestId,
    }));
  }

  async settleRivalryChallenge(input: SettleMatchInput): Promise<SettleRivalryChallengeResult> {
    const payload = record(await this.callRpc("settle_rivalry_challenge", {
      client_match_id: input.clientMatchId,
    }), "challenge settlement");
    if (payload.status !== "settled" && payload.status !== "already-settled") {
      throw new Error("Supabase returned an invalid challenge settlement status.");
    }
    if (payload.outcome !== "win" && payload.outcome !== "loss") {
      throw new Error("Supabase returned an invalid challenge outcome.");
    }
    return {
      status: payload.status,
      challengeId: textField(payload.challenge_id, "challenge id"),
      attemptId: textField(payload.attempt_id, "challenge attempt id"),
      outcome: payload.outcome,
      playerWins: nonNegativeIntegerField(payload.player_wins, "player wins"),
      ghostWins: nonNegativeIntegerField(payload.ghost_wins, "ghost wins"),
    };
  }

  async abandonRivalryChallenge(input: AbandonMatchInput): Promise<AbandonMatchResult> {
    return abandonMatchResultField(await this.callRpc("abandon_rivalry_challenge", {
      client_match_id: input.clientMatchId,
    }));
  }

  async revokeRivalryChallenge(slug: string): Promise<void> {
    const payload = record(await this.callRpc("revoke_rivalry_challenge", {
      challenge_slug: slug,
    }), "challenge revocation");
    if (payload.status !== "revoked" && payload.status !== "already-revoked") {
      throw new Error("Supabase returned an invalid challenge revocation status.");
    }
  }

  async listRivalryChallenges(): Promise<readonly RivalryChallengeSummary[]> {
    const payload = record(await this.callRpc("list_rivalry_challenges"), "challenge list");
    if (!Array.isArray(payload.created)) throw new Error("Supabase returned an invalid challenge list.");
    return payload.created.map((value) => {
      const challenge = record(value, "challenge summary");
      return {
        slug: textField(challenge.slug, "challenge slug"),
        creatorLabel: textField(challenge.creator_label, "challenge creator"),
        mode: modeField(challenge.mode),
        difficulty: difficultyField(challenge.difficulty),
        challengeStrength: nonNegativeIntegerField(challenge.challenge_strength, "challenge strength"),
        status: challengeStatusField(challenge.status),
        createdAt: dateField(challenge.created_at, "challenge creation time"),
        expiresAt: dateField(challenge.expires_at, "challenge expiry time"),
        attempts: nonNegativeIntegerField(challenge.attempts, "challenge attempts"),
        completed: nonNegativeIntegerField(challenge.completed, "completed challenge attempts"),
        ghostDefenses: nonNegativeIntegerField(challenge.ghost_defenses, "ghost defenses"),
        challengerWins: nonNegativeIntegerField(challenge.challenger_wins, "challenger wins"),
      };
    });
  }

  async settleMatch(input: SettleMatchInput): Promise<SettleMatchResult> {
    const result = record(await this.callRpc("settle_match", {
      client_match_id: input.clientMatchId,
    }), "match settlement");
    if (!['settled', 'already-settled'].includes(String(result.status))) {
      throw new Error("Supabase returned an invalid match settlement.");
    }
    return {
      status: result.status as SettleMatchResult["status"],
      matchId: textField(result.match_id, "settled match id"),
      rewardCredits: nonNegativeIntegerField(result.reward_credits, "settlement reward credits"),
      credits: nonNegativeIntegerField(result.credits, "settlement credit balance"),
      completedMatches: nonNegativeIntegerField(result.completed_matches, "settlement completed matches"),
    };
  }

  async abandonMatch(input: AbandonMatchInput): Promise<AbandonMatchResult> {
    return abandonMatchResultField(await this.callRpc("abandon_match", {
      client_match_id: input.clientMatchId,
    }));
  }

  async loadSeasonLocker(): Promise<SeasonLockerState> {
    return seasonLockerField(await this.callRpc("get_season_locker"));
  }

  async claimSeasonReward(input: ClaimSeasonRewardInput): Promise<ClaimSeasonRewardResult> {
    const payload = record(await this.callRpc("claim_season_reward", {
      season_id: input.seasonId,
      tier: input.tier,
      client_request_id: input.clientRequestId,
    }), "Season reward claim");
    if (payload.status !== "claimed" && payload.status !== "already-claimed") {
      throw new Error("Supabase returned an invalid Season reward claim.");
    }
    return {
      status: payload.status,
      seasonId: textField(payload.season_id, "Season claim id"),
      tier: nonNegativeIntegerField(payload.tier, "Season claim tier"),
      reward: record(payload.reward, "Season claimed reward"),
      claimedAt: dateField(payload.claimed_at, "Season claim time"),
      credits: nonNegativeIntegerField(payload.credits, "Season claim Credits"),
    };
  }

  async startArenaMatch(input: StartArenaMatchInput): Promise<StartMatchResult> {
    return startMatchResultField(await this.callRpc("start_arena_match", {
      client_match_id: input.clientMatchId,
      mode: input.mode,
    }));
  }

  async playArenaMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult> {
    return matchRoundField(await this.callRpc("play_arena_match_round", {
      client_match_id: input.clientMatchId,
      round_index: input.roundIndex,
      player_card_id: input.playerCardId,
      client_request_id: input.clientRequestId,
    }));
  }

  async settleArenaMatch(input: SettleMatchInput): Promise<SettleMatchResult> {
    const result = record(await this.callRpc("settle_arena_match", {
      client_match_id: input.clientMatchId,
    }), "Arena settlement");
    if (result.status !== "settled" && result.status !== "already-settled") {
      throw new Error("Supabase returned an invalid Arena settlement.");
    }
    return {
      status: result.status,
      matchId: textField(result.match_id, "Arena match id"),
      rewardCredits: nonNegativeIntegerField(result.reward_credits, "Arena reward Credits"),
      credits: nonNegativeIntegerField(result.credits, "Arena credit balance"),
      completedMatches: nonNegativeIntegerField(result.completed_matches, "Arena completed matches"),
    };
  }

  async abandonArenaMatch(input: AbandonMatchInput): Promise<AbandonMatchResult> {
    return abandonMatchResultField(await this.callRpc("abandon_arena_match", {
      client_match_id: input.clientMatchId,
    }));
  }

  async loadLiveRivalryRoom(roomId?: string): Promise<LiveRivalryRoomState | null> {
    const payload = await this.callRpc("get_live_rivalry_room", { room_id: roomId ?? null });
    const possibleNone = record(payload, "Live room state");
    return possibleNone.status === "none" ? null : liveRivalryRoomField(possibleNone);
  }

  async createLiveRivalryRoom(input: CreateLiveRivalryRoomInput): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("create_live_rivalry_room", {
      client_request_id: input.clientRequestId,
      mode: input.mode,
      lineup_id: input.lineupId,
    }));
  }

  async joinLiveRivalryRoom(input: JoinLiveRivalryRoomInput): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("join_live_rivalry_room", {
      room_code: input.roomCode.trim().toUpperCase(),
      client_request_id: input.clientRequestId,
      lineup_id: input.lineupId,
    }));
  }

  async setLiveRivalryReady(roomId: string, ready: boolean, clientRequestId: string): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("set_live_rivalry_ready", {
      room_id: roomId,
      ready,
      client_request_id: clientRequestId,
    }));
  }

  async lockLiveRivalryChoice(input: LockLiveRivalryChoiceInput): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("lock_live_rivalry_choice", {
      room_id: input.roomId,
      round_index: input.roundIndex,
      card_id: input.cardId,
      client_request_id: input.clientRequestId,
    }));
  }

  async leaveLiveRivalryRoom(roomId: string, clientRequestId: string): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("leave_live_rivalry_room", {
      room_id: roomId,
      client_request_id: clientRequestId,
    }));
  }

  async createLiveRivalryRematch(previousRoomId: string, clientRequestId: string, lineupId: string): Promise<LiveRivalryRoomState> {
    return liveRivalryRoomField(await this.callRpc("create_live_rivalry_rematch", {
      previous_room_id: previousRoomId,
      client_request_id: clientRequestId,
      lineup_id: lineupId,
    }));
  }

  subscribeToLiveRivalryRoom(
    topic: string,
    onUpdate: (stateVersion: number) => void,
    onStatus?: (status: string) => void,
  ): () => void {
    let channel: RealtimeChannel | null = null;
    let active = true;
    void this.client.realtime.setAuth().then(() => {
      if (!active) return;
      channel = this.client
        .channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } })
        .on("broadcast", { event: "room_updated" }, ({ payload }) => {
          const stateVersion = Number((payload as { state_version?: unknown }).state_version);
          if (Number.isSafeInteger(stateVersion) && stateVersion > 0) onUpdate(stateVersion);
        })
        .subscribe((status) => onStatus?.(status));
    }).catch(() => onStatus?.("CHANNEL_ERROR"));
    return () => {
      active = false;
      if (channel) void this.client.removeChannel(channel);
    };
  }

  private toLineup(lineup: LineupRow, slots: LineupSlotRow[]): AccountLineup {
    const mappedSlots: Partial<Record<LineupSlot, string>> = {};
    for (const row of slots) mappedSlots[row.slot as LineupSlot] = row.card_id;
    return {
      id: lineup.id,
      name: lineup.name,
      mode: lineup.mode as GameMode,
      isActive: lineup.is_active,
      slots: mappedSlots,
    };
  }

  private async callRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await (this.client as unknown as UntypedRpcClient).rpc(name, args);
    return requireData(data, error);
  }

  private toRpcLineup(value: unknown): AccountLineup {
    const lineup = record(value, "lineup");
    const rawSlots = record(lineup.slots, "lineup slots");
    const slots: Partial<Record<LineupSlot, string>> = {};
    for (const slot of ["LW", "C", "RW", "LD", "RD", "G"] as const) {
      if (typeof rawSlots[slot] === "string") slots[slot] = rawSlots[slot];
    }
    return {
      id: textField(lineup.id, "lineup id"),
      name: textField(lineup.name, "lineup name"),
      mode: modeField(lineup.mode),
      isActive: Boolean(lineup.is_active),
      slots,
    };
  }
}
