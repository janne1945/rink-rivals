import type { SupabaseClient } from "@supabase/supabase-js";

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

export interface SettleMatchResult {
  readonly status: "settled" | "already-settled";
  readonly matchId: string;
  readonly rewardCredits: number;
  readonly credits: number;
  readonly completedMatches: number;
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

function nonNegativeIntegerField(value: unknown, label: string): number {
  const parsed = numberField(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Supabase returned an invalid ${label}.`);
  return parsed;
}

function modeField(value: unknown): GameMode {
  if (!["nhl-circuit", "pwhl-circuit", "open-ice"].includes(String(value))) {
    throw new Error("Supabase returned an invalid lineup mode.");
  }
  return value as GameMode;
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
    const payload = record(await this.callRpc("start_match", {
      client_match_id: input.clientMatchId,
      mode: input.mode,
      difficulty: input.difficulty,
    }), "match start result");
    const difficulty = String(payload.difficulty);
    if (!["rookie", "pro", "elite"].includes(difficulty)) {
      throw new Error("Supabase returned an invalid match difficulty.");
    }
    const status = payload.status;
    if (status !== "started" && status !== "already-started") throw new Error("Supabase returned an invalid match start status.");
    const opponent = record(payload.opponent, "match opponent");
    const lineup = record(payload.lineup, "match lineup");
    if (!Array.isArray(payload.situations) || payload.situations.length !== 5) {
      throw new Error("Supabase returned an invalid match situation deck.");
    }
    if (!Array.isArray(payload.rounds) || payload.rounds.length > 5) throw new Error("Supabase returned invalid resumed match rounds.");
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
      difficulty: difficulty as StartMatchResult["difficulty"],
    };
  }

  async playMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult> {
    return matchRoundField(await this.callRpc("play_match_round", {
      client_match_id: input.clientMatchId,
      round_index: input.roundIndex,
      player_card_id: input.playerCardId,
      client_request_id: input.clientRequestId,
    }));
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
