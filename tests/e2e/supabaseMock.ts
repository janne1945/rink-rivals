import type { Page, Route } from "@playwright/test";
import { createHash } from "node:crypto";

import { selectAiOpponent, type AiDifficulty } from "../../src/domain/battle";
import { validateLineup, type GameMode, type LineupSlot } from "../../src/domain/lineups";
import {
  getUtcDayKey,
  getUtcWeekKey,
  RIVALRY_REWARD_CARD_IDS,
} from "../../src/domain/progression";
import {
  EVENT_CALENDAR,
  EVENT_CALENDAR_ANCHOR,
  getEventCalendarWeekIndex,
  type EventCalendarRotation,
  type MarketCard,
} from "../../src/domain/shop";
import { gameCatalog } from "./gameCatalogFixture";

const projectRef = "zsyoxpirfxajkruqeqam";
const userId = "11111111-1111-4111-8111-111111111111";
const starterLineupId = "33333333-3333-4333-8333-333333333333";
const mockNow = "2026-07-14T12:00:00.000Z";
const mockDate = new Date(mockNow);
const weekInMs = 7 * 86_400_000;
const signatureLaunchAnchor = Date.parse("2026-07-13T00:00:00.000Z");
const mockDailyPeriodKey = getUtcDayKey(mockDate);
const mockWeeklyPeriodKey = getUtcWeekKey(mockDate);

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Mirrors the server slot phase while retaining its existing offer cadence. */
function resolveServerEventRotation(
  cards: readonly MarketCard[],
  at: Date,
): EventCalendarRotation {
  const timestamp = at.getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError("Supabase mock market date must be valid.");
  const launchWeekIndex = Math.floor((timestamp - signatureLaunchAnchor) / weekInMs);
  const event = EVENT_CALENDAR[positiveModulo(launchWeekIndex + 1, EVENT_CALENDAR.length)];
  if (!event) throw new Error("Supabase mock could not resolve the active event.");
  const marketWeekIndex = getEventCalendarWeekIndex(at);
  const eventOccurrenceIndex = Math.floor(marketWeekIndex / event.rotation.recurrenceWeeks);
  const eligibleCards = cards
    .filter((card) => card.cardType === "event"
      && card.marketAvailability === "event-shop"
      && !card.isPermanent
      && card.setId === event.id
      && (card.availableFrom === undefined || Date.parse(card.availableFrom) <= timestamp)
      && (card.availableTo === undefined || timestamp < Date.parse(card.availableTo)))
    .sort((left, right) => {
      const leftHash = createHash("md5").update(`rink-rivals:${event.id}:v1:${left.id}`).digest("hex");
      const rightHash = createHash("md5").update(`rink-rivals:${event.id}:v1:${right.id}`).digest("hex");
      return leftHash.localeCompare(rightHash) || left.id.localeCompare(right.id);
    });
  const offerCount = Math.min(event.rotation.offerCount, eligibleCards.length);
  const selectionStart = eligibleCards.length === 0
    ? 0
    : positiveModulo(eventOccurrenceIndex * event.rotation.offerCount, eligibleCards.length);
  const selectedCards = eligibleCards
    .map((card, deckIndex) => ({
      card,
      selectionIndex: positiveModulo(deckIndex - selectionStart, eligibleCards.length),
    }))
    .filter(({ selectionIndex }) => selectionIndex < offerCount)
    .sort((left, right) => left.selectionIndex - right.selectionIndex);
  const spotlightOfferNumber = offerCount === 0
    ? -1
    : positiveModulo(marketWeekIndex, offerCount) + 1;
  const startsAt = Date.parse(EVENT_CALENDAR_ANCHOR) + marketWeekIndex * weekInMs;
  const rotationKey = `${event.id}:7d:${marketWeekIndex}`;
  const shop = {
    kind: "event_shop" as const,
    eventSetId: event.id,
    rotationKey,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + weekInMs).toISOString(),
    offers: selectedCards.map(({ card, selectionIndex }) => {
      const isSpotlight = selectionIndex + 1 === spotlightOfferNumber;
      return {
        id: `event-shop:${rotationKey}:${card.id}`,
        cardId: card.id,
        regularPrice: card.price,
        price: isSpotlight ? Math.max(1, Math.round(card.price * 0.85)) : card.price,
        placement: isSpotlight ? "spotlight" as const : "standard" as const,
        source: "event_shop" as const,
        currency: "credits" as const,
      };
    }),
  };
  return { event, weekIndex: marketWeekIndex, shop };
}

const mockEventRotation = resolveServerEventRotation(gameCatalog.cards, mockDate);
const defaultStarterTeamId = gameCatalog.teams.find((team) => team.name === "Edmonton Oilers")?.id
  ?? gameCatalog.starterSquads[0]?.teamId
  ?? "";
const catalogPlayers = new Map(gameCatalog.players.map((player) => [player.id, player]));
const catalogCards = new Map(gameCatalog.cards.map((card) => [card.id, card]));
const lineupSlotOrder: readonly LineupSlot[] = ["LW", "C", "RW", "LD", "RD", "G"];

const serverSituations = [
  { id: "skater-speed", name: "Speed", description: "Higher Speed wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW"], attribute: "speed" },
  { id: "skater-shooting", name: "Shooting", description: "Higher Shooting wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW"], attribute: "shooting" },
  { id: "skater-defense", name: "Defense", description: "Higher Defense wins this round.", role: "skater", eligible_slots: ["LD", "RD"], attribute: "defense" },
  { id: "skater-clutch", name: "Clutch", description: "Higher Clutch wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW", "LD", "RD"], attribute: "clutch" },
  { id: "goalie-reflexes", name: "Reflexes", description: "Higher Reflexes wins this round.", role: "goalie", eligible_slots: ["G"], attribute: "reflexes" },
] as const;

type MockLineup = {
  id: string;
  name: string;
  mode: GameMode;
  isActive: boolean;
  slots: Record<LineupSlot, string>;
  createdAt: string;
  updatedAt: string;
};

type PurchaseReceipt = {
  requestId: string;
  offerId: string;
  cardId: string;
  price: number;
  purchasedAt: string;
};

type MatchTicket = {
  clientMatchId: string;
  mode: GameMode;
  difficulty: AiDifficulty;
  seed: string;
  opponentId: string;
  opponentName: string;
  playerLineupId: string;
  playerLineupName: string;
  playerSlots: Record<LineupSlot, string>;
  opponentSlots: Record<LineupSlot, string>;
  rounds: Map<number, MockRoundReceipt>;
  roundRequests: Map<string, MockRoundReceipt>;
  status: "open" | "settled" | "abandoned";
};

type MockRoundReceipt = {
  clientRequestId: string;
  roundIndex: number;
  situationId: string;
  playerCardId: string;
  playerSlot: LineupSlot;
  playerScore: number;
  opponentCardId: string;
  opponentSlot: LineupSlot;
  opponentScore: number;
  winner: "player" | "opponent" | "tie";
  tieBreaker: "category" | "overall" | "match-seed";
  transcript: {
    situation: (typeof serverSituations)[number];
    player: { value: number; overall: number };
    opponent: { value: number; overall: number };
    tie_breaker: "category" | "overall" | "match-seed";
  };
};

type MockRivalryChallenge = {
  slug: string;
  creatorLabel: string;
  owned: boolean;
  mode: GameMode;
  difficulty: AiDifficulty;
  challengeStrength: number;
  playerLineupName: string;
  playerSlots: Record<LineupSlot, string>;
  ghostSelections: Array<{ cardId: string; slot: LineupSlot }>;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  attempts: number;
  completed: number;
  ghostDefenses: number;
  challengerWins: number;
};

type LivePendingChoice = {
  clientRequestId: string;
  roundIndex: number;
  cardId: string;
};

export interface SupabaseMockOptions {
  readonly authenticated?: boolean;
  readonly onboardingCompleted?: boolean;
  readonly duplicateClaim?: boolean;
  readonly claimResponseLossOnce?: boolean;
  readonly selectedTeamId?: string;
  readonly loginError?: boolean;
  readonly profileError?: boolean;
  readonly purchaseError?: boolean;
  readonly purchaseDelayMs?: number;
  readonly lineupSaveError?: boolean;
  readonly startMatchError?: boolean;
  readonly rivalryStartResponseLossOnce?: boolean;
  readonly roundError?: boolean;
  readonly roundResponseLossOnce?: boolean;
  readonly roundDelayMs?: number;
  readonly settlementError?: boolean;
  readonly settlementErrorOnce?: boolean;
  readonly abandonErrorOnce?: boolean;
  /** Test-only deterministic server seed for match choreography fixtures. */
  readonly matchSeed?: string;
  /** Test-only server clock override for deterministic Event Shop rotations. */
  readonly marketNow?: string;
  readonly state?: SupabaseMockState;
}

export interface SupabaseMockState {
  onboardingCompleted: boolean;
  selectedTeamId: string | null;
  credits: number;
  completedMatches: number;
  cards: Map<string, { quantity: number; acquiredAt: string }>;
  lineups: Map<string, MockLineup>;
  purchases: Map<string, PurchaseReceipt>;
  matchTickets: Map<string, MatchTicket>;
  settlements: Map<string, { matchId: string; rewardCredits: number; outcome: "win" | "draw" | "loss" }>;
  rewardClaims: Map<string, { cardId: string; claimedAt: string }>;
  seasonXp: number;
  seasonClaims: Map<number, string>;
  liveRoom: Record<string, unknown> | null;
  liveOpponentSlots: Record<LineupSlot, string> | null;
  livePendingChoice: LivePendingChoice | null;
  liveRoundRequests: Map<string, LivePendingChoice>;
  rivalryChallenges: Map<string, MockRivalryChallenge>;
  ghostAttemptSlugs: Map<string, string>;
  ghostSettlements: Map<string, { outcome: "win" | "loss"; playerWins: number; ghostWins: number }>;
  objectives: Array<Record<string, unknown>>;
  rivalryRoad: { user_id: string; current_step_index: number; completed_step_ids: string[]; status: string; selected_card_id: string | null; updated_at: string };
  eventEndsAt: string;
  eventOfferEndsAt: string | null;
  purchaseCallCount: number;
  lineupSaveCallCount: number;
  startMatchCallCount: number;
  playRoundCallCount: number;
  settleMatchCallCount: number;
  starterClaimCallCount: number;
}

function starterLineup(teamId: string): MockLineup {
  const team = gameCatalog.teams.find((candidate) => candidate.id === teamId);
  const starter = gameCatalog.starterSquads.find((candidate) => candidate.teamId === teamId);
  if (!team || !starter) throw new Error(`Missing mock starter data for ${teamId}.`);
  return {
    id: starterLineupId,
    name: `${team.name} Starter`,
    mode: team.league === "NHL" ? "nhl-circuit" : "pwhl-circuit",
    isActive: true,
    slots: { ...starter.lineup },
    createdAt: mockNow,
    updatedAt: mockNow,
  };
}

function provisionStarter(state: SupabaseMockState, teamId: string): void {
  const starter = gameCatalog.starterSquads.find((candidate) => candidate.teamId === teamId);
  if (!starter) throw new Error(`Missing mock starter data for ${teamId}.`);
  for (const cardId of starter.cards) {
    if (!state.cards.has(cardId)) state.cards.set(cardId, { quantity: 1, acquiredAt: mockNow });
  }
  state.selectedTeamId = teamId;
  state.lineups.set(starterLineupId, starterLineup(teamId));
}

function mockOpponentSlots(
  opponent: ReturnType<typeof selectAiOpponent>,
  seed: string,
): Record<LineupSlot, string> {
  const { mode, difficulty } = opponent;
  const variantCount = difficulty === "rookie" ? 16 : difficulty === "pro" ? 8 : 3;
  const variantHash = createHash("md5")
    .update(`${seed}:${opponent.id}:${difficulty}`)
    .digest("hex");
  const variantIndex = Number.parseInt(variantHash.slice(0, 2), 16) % variantCount;
  const selectionSeed = `${opponent.id}:${difficulty}:variant:${variantIndex}`;
  const usedCards = new Set<string>();
  const usedPlayers = new Set<string>();
  return Object.fromEntries(lineupSlotOrder.map((slot) => {
    const anchorCard = catalogCards.get(opponent.lineup.slots[slot]);
    const anchorPlayer = anchorCard ? catalogPlayers.get(anchorCard.playerId) : null;
    const requiredLeague = mode === "nhl-circuit"
      ? "NHL"
      : mode === "pwhl-circuit" ? "PWHL" : anchorPlayer?.league;
    if (!requiredLeague) throw new Error(`Missing mock opponent league anchor for ${opponent.id} ${slot}.`);
    const candidates = gameCatalog.cards
      .filter((card) => {
        const player = catalogPlayers.get(card.playerId);
        const allowedDifficultyPool = difficulty === "rookie"
          ? card.cardType === "base" && card.marketAvailability === "base-market" && card.overall >= 68 && card.overall <= 76
          : difficulty === "pro"
            ? card.cardType === "base" && card.marketAvailability === "base-market" && card.overall >= 77 && card.overall <= 82
            : card.cardType === "event" && card.marketAvailability === "event-shop" && card.overall >= 87;
        return allowedDifficultyPool
          && player?.active
          && player.sourceMetadata.sourceRosterStatus === "active-roster"
          && player?.eligiblePositions.includes(slot as never)
          && player.league === requiredLeague
          && !usedCards.has(card.id)
          && !usedPlayers.has(card.playerId);
      })
      .sort((left, right) => {
        const leftHash = createHash("md5").update(`${selectionSeed}:${slot}:${left.id}`).digest("hex");
        const rightHash = createHash("md5").update(`${selectionSeed}:${slot}:${right.id}`).digest("hex");
        return leftHash.localeCompare(rightHash) || left.id.localeCompare(right.id);
      });
    const card = candidates[0];
    if (!card) throw new Error(`Missing mock opponent ${slot} for ${mode}.`);
    usedCards.add(card.id);
    usedPlayers.add(card.playerId);
    return [slot, card.id];
  })) as Record<LineupSlot, string>;
}

export function createSupabaseMockState(onboardingCompleted = true, selectedTeamId = defaultStarterTeamId): SupabaseMockState {
  const state: SupabaseMockState = {
    onboardingCompleted,
    selectedTeamId: onboardingCompleted ? selectedTeamId : null,
    credits: onboardingCompleted ? 1000 : 0,
    completedMatches: 0,
    cards: new Map(),
    lineups: new Map(),
    purchases: new Map(),
    matchTickets: new Map(),
    settlements: new Map(),
    rewardClaims: new Map(),
    seasonXp: 240,
    seasonClaims: new Map(),
    liveRoom: null,
    liveOpponentSlots: null,
    livePendingChoice: null,
    liveRoundRequests: new Map(),
    rivalryChallenges: new Map(),
    ghostAttemptSlugs: new Map(),
    ghostSettlements: new Map(),
    objectives: [],
    rivalryRoad: { user_id: userId, current_step_index: 0, completed_step_ids: [], status: "in-progress", selected_card_id: null, updated_at: mockNow },
    eventEndsAt: mockEventRotation.shop.endsAt,
    eventOfferEndsAt: null,
    purchaseCallCount: 0,
    lineupSaveCallCount: 0,
    startMatchCallCount: 0,
    playRoundCallCount: 0,
    settleMatchCallCount: 0,
    starterClaimCallCount: 0,
  };
  if (onboardingCompleted) provisionStarter(state, selectedTeamId);
  return state;
}

export function seedRivalryChallenge(
  state: SupabaseMockState,
  overrides: Partial<MockRivalryChallenge> = {},
): MockRivalryChallenge {
  const source = starterLineup(defaultStarterTeamId);
  const ghostSlots = mockOpponentSlots(selectAiOpponent(source.mode, "rookie", "seeded-ghost-rival"), "seeded-ghost-rival");
  const challenge: MockRivalryChallenge = {
    slug: "0123456789abcdef0123456789abcdef",
    creatorLabel: "Morgan",
    owned: false,
    mode: source.mode,
    difficulty: "rookie",
    challengeStrength: 82,
    playerLineupName: "Morgan's Six",
    playerSlots: ghostSlots,
    ghostSelections: ["LW", "C", "LD", "RW", "G"].map((slot) => ({
      slot: slot as LineupSlot,
      cardId: ghostSlots[slot as LineupSlot],
    })),
    status: "active",
    createdAt: mockNow,
    expiresAt: "2026-08-13T12:00:00.000Z",
    attempts: 0,
    completed: 0,
    ghostDefenses: 0,
    challengerWins: 0,
    ...overrides,
  };
  state.rivalryChallenges.set(challenge.slug, challenge);
  return challenge;
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const accessToken = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ sub: userId, role: "authenticated", email: "alex@example.com", exp: 4_102_444_800 })}.test-signature`;

const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "alex@example.com",
  email_confirmed_at: mockNow,
  phone: "",
  confirmed_at: mockNow,
  last_sign_in_at: mockNow,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Alex" },
  identities: [],
  created_at: mockNow,
  updated_at: mockNow,
  is_anonymous: false,
};

const session = {
  access_token: accessToken,
  refresh_token: "test-refresh-token",
  expires_in: 2_000_000_000,
  expires_at: 4_102_444_800,
  token_type: "bearer",
  user,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    headers: { "access-control-allow-origin": "*" },
  });
}

function databaseError(route: Route, message: string, status = 400) {
  return json(route, { code: status === 503 ? "40001" : "P0001", message, details: null, hint: null }, status);
}

function lineupRow(lineup: MockLineup) {
  return {
    id: lineup.id,
    user_id: userId,
    name: lineup.name,
    mode: lineup.mode,
    is_active: lineup.isActive,
    created_at: lineup.createdAt,
    updated_at: lineup.updatedAt,
  };
}

function rpcLineup(lineup: MockLineup) {
  return { ...lineupRow(lineup), slots: lineup.slots };
}

function seasonRewards(state: SupabaseMockState) {
  return Array.from({ length: 30 }, (_, index) => {
    const tier = index + 1;
    const isNhlCard = tier === 15;
    const isPwhlCard = tier === 30;
    const cardId = isNhlCard
      ? "nhl-connor-mcdavid-rivalry-2026"
      : isPwhlCard ? "pwhl-marie-philip-poulin-rivalry-2026" : null;
    return {
      tier,
      xp_required: tier * 100,
      reward_type: cardId ? "card" : tier % 4 === 0 ? "banner" : "credits",
      label: cardId ? (isNhlCard ? "NHL Seasonal Star" : "PWHL Seasonal Star") : `Tier ${tier} Reward`,
      description: cardId ? "Guaranteed seasonal reward card." : tier % 4 === 0 ? "Guaranteed Season cosmetic." : `${100 + tier * 25} Rivalry Points.`,
      amount: cardId || tier % 4 === 0 ? null : 100 + tier * 25,
      card_id: cardId,
      cosmetic_slug: tier % 4 === 0 ? `season-banner-${tier}` : null,
      metadata: cardId ? { league: isNhlCard ? "NHL" : "PWHL" } : {},
      unlocked: state.seasonXp >= tier * 100,
      claimed: state.seasonClaims.has(tier),
      claimed_at: state.seasonClaims.get(tier) ?? null,
    };
  });
}

function mockLiveRoom(lineup: MockLineup): Record<string, unknown> {
  return {
    server_time: "2026-07-15T12:00:00.000Z",
    room_id: "55555555-5555-4555-8555-555555555555",
    room_code: "RANK26",
    topic: "live-rivalry:55555555-5555-4555-8555-555555555555",
    status: "waiting",
    state_version: 1,
    mode: lineup.mode,
    current_round: 0,
    situations: serverSituations,
    created_at: "2026-07-15T12:00:00.000Z",
    started_at: null,
    completed_at: null,
    expires_at: "2026-07-15T12:15:00.000Z",
    rematch_of: null,
    me: {
      user_id: userId,
      role: "host",
      display_label: "Alex",
      lineup_id: lineup.id,
      lineup_name: lineup.name,
      lineup: rpcLineup(lineup),
      ready: false,
      locked: false,
    },
    opponent: null,
    rounds: [],
    result: null,
    head_to_head: { matches: 0, player_wins: 0, opponent_wins: 0 },
    rewards: { credits: 0, season_xp: 0, cards: 0, objectives: 0 },
  };
}

function resolvePendingLiveChoice(state: SupabaseMockState): void {
  const pending = state.livePendingChoice;
  const room = state.liveRoom;
  const opponentSlots = state.liveOpponentSlots;
  if (!pending || !room || !opponentSlots || room.status !== "active") return;

  const me = room.me as Record<string, unknown>;
  const lineup = me.lineup as Record<string, unknown>;
  const playerSlots = lineup.slots as Record<LineupSlot, string>;
  const rounds = room.rounds as Array<Record<string, unknown>>;
  const situation = serverSituations[pending.roundIndex];
  if (!situation) throw new Error(`Missing Live situation ${pending.roundIndex}.`);
  const playerSlot = lineupSlotOrder.find((slot) => playerSlots[slot] === pending.cardId);
  if (!playerSlot) throw new Error(`Live player card ${pending.cardId} is not in the mock lineup.`);

  const usedOpponentCards = new Set(rounds.map((round) => String(round.opponent_card_id)));
  const opponentChoice = lineupSlotOrder
    .filter((slot) => situation.eligible_slots.includes(slot as never))
    .map((slot) => ({ slot, cardId: opponentSlots[slot] }))
    .find(({ cardId }) => !usedOpponentCards.has(cardId));
  if (!opponentChoice) throw new Error(`Missing eligible Live opponent card for round ${pending.roundIndex}.`);

  const playerScore = scoreCard(pending.cardId, situation.attribute);
  const opponentScore = scoreCard(opponentChoice.cardId, situation.attribute);
  const tieBreaker = playerScore.value !== opponentScore.value
    ? "category"
    : playerScore.overall !== opponentScore.overall ? "overall" : "match-seed";
  const winner = playerScore.value !== opponentScore.value
    ? playerScore.value > opponentScore.value ? "player" : "opponent"
    : playerScore.overall !== opponentScore.overall
      ? playerScore.overall > opponentScore.overall ? "player" : "opponent"
      : pending.roundIndex % 2 === 0 ? "player" : "opponent";
  rounds.push({
    round_index: pending.roundIndex,
    situation_id: situation.id,
    player_card_id: pending.cardId,
    player_slot: playerSlot,
    player_score: playerScore.value,
    opponent_card_id: opponentChoice.cardId,
    opponent_slot: opponentChoice.slot,
    opponent_score: opponentScore.value,
    winner,
    tie_breaker: tieBreaker,
    transcript: { situation, player: playerScore, opponent: opponentScore },
    resolved_at: "2026-07-15T12:05:00.000Z",
  });
  room.current_round = pending.roundIndex + 1;
  room.state_version = Number(room.state_version) + 1;
  room.me = { ...me, locked: false };
  room.opponent = { ...(room.opponent as Record<string, unknown>), locked: false };
  state.livePendingChoice = null;

  if (Number(room.current_round) === 5) {
    const playerWins = rounds.filter((round) => round.winner === "player").length;
    const opponentWins = 5 - playerWins;
    const playerWon = playerWins > opponentWins;
    room.status = "completed";
    room.completed_at = "2026-07-15T12:05:00.000Z";
    room.result = {
      outcome: playerWon ? "win" : "loss",
      player_wins: playerWins,
      opponent_wins: opponentWins,
      winner_user_id: playerWon ? userId : "22222222-2222-4222-8222-222222222222",
    };
    room.head_to_head = {
      matches: 1,
      player_wins: playerWon ? 1 : 0,
      opponent_wins: playerWon ? 0 : 1,
    };
  }
}

function queryValue(url: URL, field: string, operator: "eq" | "in"): string | null {
  const raw = url.searchParams.get(field);
  const prefix = `${operator}.`;
  return raw?.startsWith(prefix) ? raw.slice(prefix.length) : null;
}

function currentOffers(
  state: SupabaseMockState,
  eventRotation = mockEventRotation,
  serverNow = mockNow,
) {
  const baseOffers = gameCatalog.cards
    .filter((card) => card.cardType === "base" && card.marketAvailability === "base-market")
    .map((card) => ({
      offer_id: `base-market:${card.id}`,
      card_id: card.id,
      source: "base_market",
      regular_price: card.price,
      price: card.price,
      event_id: null,
      placement: "standard",
      starts_at: null,
      ends_at: null,
      owned_quantity: state.cards.get(card.id)?.quantity ?? 0,
    }));
  if (Date.parse(state.eventEndsAt) <= Date.parse(serverNow)) return baseOffers;
  const eventOffers = eventRotation.shop.offers.map((offer) => ({
    offer_id: `event-shop:${eventRotation.event.id}:${eventRotation.shop.startsAt.slice(0, 10)}:${offer.cardId}`,
    card_id: offer.cardId,
    source: "event_shop",
    regular_price: offer.regularPrice,
    price: offer.price,
    event_id: eventRotation.event.id,
    placement: offer.placement,
    starts_at: eventRotation.shop.startsAt,
    ends_at: state.eventOfferEndsAt ?? state.eventEndsAt,
    owned_quantity: state.cards.get(offer.cardId)?.quantity ?? 0,
  }));
  return [...baseOffers, ...eventOffers];
}

function deterministicIndex(key: string, length: number): number {
  let hash = 0;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return Math.abs(hash) % length;
}

function scoreCard(cardId: string, attribute: string) {
  const card = gameCatalog.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown mock card ${cardId}.`);
  const attributes = card.attributes as unknown as Record<string, number>;
  return { value: attributes[attribute] ?? 0, overall: card.overall };
}

function roundResponse(status: "played" | "already-played", ticket: MatchTicket, round: MockRoundReceipt) {
  return {
    status,
    client_match_id: ticket.clientMatchId,
    round_index: round.roundIndex,
    situation_id: round.situationId,
    player_card_id: round.playerCardId,
    player_slot: round.playerSlot,
    player_score: round.playerScore,
    opponent_card_id: round.opponentCardId,
    opponent_slot: round.opponentSlot,
    opponent_score: round.opponentScore,
    winner: round.winner,
    tie_breaker: round.tieBreaker,
    transcript: round.transcript,
  };
}

function startResponse(status: "started" | "already-started", ticket: MatchTicket) {
  return {
    status,
    client_match_id: ticket.clientMatchId,
    seed: ticket.seed,
    opponent_id: ticket.opponentId,
    opponent: { id: ticket.opponentId, name: ticket.opponentName, mode: ticket.mode, slots: ticket.opponentSlots },
    lineup: { id: ticket.playerLineupId, name: ticket.playerLineupName, mode: ticket.mode, slots: ticket.playerSlots },
    situations: serverSituations,
    rounds: [...ticket.rounds.values()]
      .sort((left, right) => left.roundIndex - right.roundIndex)
      .map((round) => roundResponse("already-played", ticket, round)),
    mode: ticket.mode,
    difficulty: ticket.difficulty,
  };
}

function completeSettlement(
  state: SupabaseMockState,
  body: { client_match_id: string; match_mode: GameMode; match_difficulty: AiDifficulty; match_outcome: "win" | "draw" | "loss" },
) {
  const baseRewards = {
    rookie: { win: 120, draw: 90, loss: 60 },
    pro: { win: 180, draw: 120, loss: 80 },
    elite: { win: 260, draw: 160, loss: 100 },
  } as const;
  const base = baseRewards[body.match_difficulty][body.match_outcome];
  const rewardCredits = base + 75 + (body.match_outcome === "win" ? 100 : 0) + (body.match_mode === "nhl-circuit" ? 150 : 0);
  state.completedMatches += 1;
  state.credits += rewardCredits;
  state.objectives = [
    { user_id: userId, objective_id: "daily-match-complete", period_key: mockDailyPeriodKey, current: 1, target: 1, completed_modes: [], completed_at: mockNow, reward_credits: 75, updated_at: mockNow },
    ...(body.match_outcome === "win" ? [{ user_id: userId, objective_id: "daily-match-win", period_key: mockDailyPeriodKey, current: 1, target: 1, completed_modes: [], completed_at: mockNow, reward_credits: 100, updated_at: mockNow }] : []),
    { user_id: userId, objective_id: "weekly-circuit-tour", period_key: mockWeeklyPeriodKey, current: 1, target: 5, completed_modes: [body.match_mode], completed_at: null, reward_credits: 350, updated_at: mockNow },
  ];
  if (body.match_mode === "nhl-circuit") {
    state.rivalryRoad = { ...state.rivalryRoad, current_step_index: 1, completed_step_ids: ["nhl-circuit-complete"], updated_at: mockNow };
  }
  const matchId = `settled-${body.client_match_id}`;
  state.settlements.set(body.client_match_id, { matchId, rewardCredits, outcome: body.match_outcome });
  const ticket = state.matchTickets.get(body.client_match_id);
  if (ticket) ticket.status = "settled";
  return { status: "settled", match_id: matchId, reward_credits: rewardCredits, credits: state.credits, completed_matches: state.completedMatches };
}

export async function installSupabaseMock(page: Page, options: SupabaseMockOptions = {}): Promise<SupabaseMockState> {
  const state = options.state ?? createSupabaseMockState(options.onboardingCompleted ?? true, options.selectedTeamId ?? defaultStarterTeamId);
  const marketNow = options.marketNow ?? mockNow;
  const marketDate = new Date(marketNow);
  if (!Number.isFinite(marketDate.getTime())) throw new TypeError("Supabase mock marketNow must be a valid timestamp.");
  const marketEventRotation = options.marketNow
    ? resolveServerEventRotation(gameCatalog.cards, marketDate)
    : mockEventRotation;
  if (options.marketNow && !options.state) state.eventEndsAt = marketEventRotation.shop.endsAt;
  let dropClaimResponseOnce = options.claimResponseLossOnce ?? false;
  let dropRoundResponseOnce = options.roundResponseLossOnce ?? false;
  let dropRivalryStartResponseOnce = options.rivalryStartResponseLossOnce ?? false;
  let failSettlementOnce = options.settlementErrorOnce ?? false;
  let failAbandonmentOnce = options.abandonErrorOnce ?? false;
  await page.routeWebSocket(new RegExp(`^wss://${projectRef}\\.supabase\\.co/realtime/v1/websocket`), (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== "string") return;
      try {
        const packet = JSON.parse(message) as unknown;
        if (!Array.isArray(packet) || packet.length < 5) return;
        const [joinRef, ref, topic, event] = packet;
        if (event === "phx_join" || event === "heartbeat") {
          socket.send(JSON.stringify([
            joinRef,
            ref,
            topic,
            "phx_reply",
            { status: "ok", response: {} },
          ]));
        }
      } catch {
        // Ignore malformed test-client traffic; the browser remains connected.
      }
    });
  });
  if (options.authenticated) {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: `sb-${projectRef}-auth-token`,
      value: JSON.stringify(session),
    });
  }

  await page.route(`https://${projectRef}.supabase.co/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/v1/token") {
      if (options.loginError) return databaseError(route, "Invalid login credentials");
      return json(route, session);
    }
    if (url.pathname === "/auth/v1/signup") return json(route, user);
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
    if (url.pathname === "/auth/v1/user") return json(route, user);

    if (url.pathname === "/rest/v1/profiles") {
      if (options.profileError) return databaseError(route, "Profile service unavailable", 503);
      return json(route, {
        id: userId,
        display_name: "Alex",
        favorite_team_id: state.selectedTeamId,
        credits: state.credits,
        completed_matches: state.completedMatches,
        onboarding_completed: state.onboardingCompleted,
        starter_claimed_at: state.onboardingCompleted ? mockNow : null,
        created_at: mockNow,
        updated_at: mockNow,
      });
    }
    if (url.pathname === "/rest/v1/user_cards") {
      return json(route, [...state.cards].map(([cardId, card]) => ({
        user_id: userId,
        card_id: cardId,
        quantity: card.quantity,
        acquired_at: card.acquiredAt,
      })));
    }
    if (url.pathname === "/rest/v1/lineups") {
      let rows = [...state.lineups.values()];
      const id = queryValue(url, "id", "eq");
      const active = queryValue(url, "is_active", "eq");
      if (id) rows = rows.filter((lineup) => lineup.id === id);
      if (active) rows = rows.filter((lineup) => String(lineup.isActive) === active);
      const response = rows.map(lineupRow);
      return request.headers().accept?.includes("vnd.pgrst.object")
        ? json(route, response[0] ?? null)
        : json(route, response);
    }
    if (url.pathname === "/rest/v1/lineup_slots") {
      const exactLineupId = queryValue(url, "lineup_id", "eq");
      const inLineupIds = queryValue(url, "lineup_id", "in")?.replace(/^\(|\)$/g, "").split(",") ?? null;
      const requestedIds = exactLineupId ? [exactLineupId] : inLineupIds;
      const lineups = [...state.lineups.values()].filter((lineup) => !requestedIds || requestedIds.includes(lineup.id));
      return json(route, lineups.flatMap((lineup) => Object.entries(lineup.slots).map(([slot, cardId]) => ({
        lineup_id: lineup.id,
        user_id: userId,
        slot,
        card_id: cardId,
      }))));
    }
    if (url.pathname === "/rest/v1/objective_progress") return json(route, state.objectives);
    if (url.pathname === "/rest/v1/rivalry_road_progress") return json(route, state.completedMatches > 0 ? state.rivalryRoad : null);

    if (url.pathname === "/rest/v1/rpc/claim_starter_team") {
      state.starterClaimCallCount += 1;
      if (options.duplicateClaim) return databaseError(route, "Starter team has already been claimed.");
      const body = request.postDataJSON() as { selected_team_id: string };
      if (state.onboardingCompleted) {
        if (state.selectedTeamId !== body.selected_team_id) {
          return databaseError(route, "A different starter team has already been claimed.");
        }
        return json(route, starterLineupId);
      }
      state.onboardingCompleted = true;
      state.credits = 1000;
      provisionStarter(state, body.selected_team_id);
      if (dropClaimResponseOnce) {
        dropClaimResponseOnce = false;
        await route.abort("failed");
        return;
      }
      return json(route, starterLineupId);
    }
    if (url.pathname === "/rest/v1/rpc/get_market_state") {
      const activeEvent = Date.parse(state.eventEndsAt) > Date.parse(marketNow);
      return json(route, {
        server_time: marketNow,
        current_event: activeEvent ? {
          id: marketEventRotation.event.id,
          name: marketEventRotation.event.name,
          description: marketEventRotation.event.description,
          starts_at: marketEventRotation.shop.startsAt,
          ends_at: state.eventEndsAt,
          visual_metadata: marketEventRotation.event.visual,
        } : null,
        offers: currentOffers(state, marketEventRotation, marketNow),
      });
    }
    if (url.pathname === "/rest/v1/rpc/get_season_locker") {
      return json(route, {
        status: "active",
        server_time: "2026-07-15T12:00:00.000Z",
        season: {
          id: "season-zero-2026",
          name: "Season Zero: First Shift",
          description: "A 28-day, gameplay-only locker. Every reward is visible and guaranteed.",
          starts_at: "2026-07-15T00:00:00.000Z",
          ends_at: "2026-08-12T00:00:00.000Z",
        },
        xp: state.seasonXp,
        faceoff_matches: 1,
        arena_matches: 1,
        rewards: seasonRewards(state),
      });
    }
    if (url.pathname === "/rest/v1/rpc/claim_season_reward") {
      const body = request.postDataJSON() as { season_id: string; tier: number; client_request_id: string };
      if (state.seasonXp < body.tier * 100) return databaseError(route, "Earn more Season XP to unlock this reward.");
      const alreadyClaimed = state.seasonClaims.has(body.tier);
      const claimedAt = state.seasonClaims.get(body.tier) ?? "2026-07-15T12:01:00.000Z";
      state.seasonClaims.set(body.tier, claimedAt);
      return json(route, {
        status: alreadyClaimed ? "already-claimed" : "claimed",
        season_id: body.season_id,
        tier: body.tier,
        reward: seasonRewards(state)[body.tier - 1],
        claimed_at: claimedAt,
        credits: state.credits,
      });
    }
    if (url.pathname === "/rest/v1/rpc/get_live_rivalry_room") {
      resolvePendingLiveChoice(state);
      return json(route, state.liveRoom ?? { status: "none" });
    }
    if (url.pathname === "/rest/v1/rpc/create_live_rivalry_room") {
      const body = request.postDataJSON() as { mode: GameMode; lineup_id: string };
      const lineup = state.lineups.get(body.lineup_id);
      if (!lineup || lineup.mode !== body.mode) return databaseError(route, "Choose a lineup that matches the Live room mode.");
      state.liveRoom = mockLiveRoom(lineup);
      return json(route, state.liveRoom);
    }
    if (url.pathname === "/rest/v1/rpc/join_live_rivalry_room") {
      const body = request.postDataJSON() as { room_code: string; lineup_id: string };
      const lineup = state.lineups.get(body.lineup_id);
      if (!lineup || body.room_code !== "RANK26") return databaseError(route, "Live room not found.");
      const joined = mockLiveRoom(lineup);
      joined.me = { ...(joined.me as Record<string, unknown>), role: "guest" };
      joined.opponent = { user_id: "22222222-2222-4222-8222-222222222222", role: "host", display_label: "Morgan", lineup_id: "rival-lineup", lineup_name: "Morgan's Six", ready: false, online: true, locked: false };
      joined.state_version = 2;
      state.liveRoom = joined;
      state.liveOpponentSlots = mockOpponentSlots(
        selectAiOpponent(lineup.mode, "pro", "live-rival-lineup"),
        "live-rival-lineup",
      );
      return json(route, joined);
    }
    if (url.pathname === "/rest/v1/rpc/set_live_rivalry_ready") {
      const body = request.postDataJSON() as { ready: boolean };
      if (!state.liveRoom) return databaseError(route, "Live room not found.");
      state.liveRoom.me = { ...(state.liveRoom.me as Record<string, unknown>), ready: body.ready };
      if (body.ready && state.liveRoom.opponent) {
        state.liveRoom.opponent = { ...(state.liveRoom.opponent as Record<string, unknown>), ready: true };
        state.liveRoom.status = "active";
        state.liveRoom.started_at = "2026-07-15T12:02:00.000Z";
        state.liveRoom.expires_at = "2026-07-16T12:02:00.000Z";
      }
      state.liveRoom.state_version = Number(state.liveRoom.state_version) + 1;
      return json(route, state.liveRoom);
    }
    if (url.pathname === "/rest/v1/rpc/lock_live_rivalry_choice") {
      const body = request.postDataJSON() as { round_index: number; card_id: string; client_request_id: string };
      if (!state.liveRoom || state.liveRoom.status !== "active") return databaseError(route, "Live room is not active.");
      const existing = state.liveRoundRequests.get(body.client_request_id);
      if (existing) {
        if (existing.roundIndex !== body.round_index || existing.cardId !== body.card_id) {
          return databaseError(route, "Live request id was already used for another choice.");
        }
        return json(route, state.liveRoom);
      }
      if (Number(state.liveRoom.current_round) !== body.round_index) return databaseError(route, "That Live round is no longer active.");
      const me = state.liveRoom.me as Record<string, unknown>;
      const lineup = me.lineup as Record<string, unknown>;
      const slots = lineup.slots as Record<LineupSlot, string>;
      const situation = serverSituations[body.round_index];
      const slot = lineupSlotOrder.find((candidate) => slots[candidate] === body.card_id);
      const usedCards = new Set((state.liveRoom.rounds as Array<Record<string, unknown>>).map((round) => String(round.player_card_id)));
      if (!situation || !slot || !situation.eligible_slots.includes(slot as never) || usedCards.has(body.card_id)) {
        return databaseError(route, "That card is not eligible for this Live round.");
      }
      const choice = { clientRequestId: body.client_request_id, roundIndex: body.round_index, cardId: body.card_id };
      state.liveRoundRequests.set(body.client_request_id, choice);
      state.livePendingChoice = choice;
      state.liveRoom.me = { ...me, locked: true };
      state.liveRoom.state_version = Number(state.liveRoom.state_version) + 1;
      return json(route, state.liveRoom);
    }
    if (url.pathname === "/rest/v1/rpc/leave_live_rivalry_room") {
      if (!state.liveRoom) return databaseError(route, "Live room not found.");
      state.liveRoom.status = state.liveRoom.status === "active" ? "completed" : "cancelled";
      state.liveRoom.state_version = Number(state.liveRoom.state_version) + 1;
      return json(route, state.liveRoom);
    }
    if (url.pathname === "/rest/v1/rpc/create_live_rivalry_rematch") {
      const me = state.liveRoom?.me as Record<string, unknown> | undefined;
      const lineupId = String(me?.lineup_id ?? "");
      const lineup = state.lineups.get(lineupId);
      if (!lineup) return databaseError(route, "Live rematch lineup not found.");
      state.liveRoom = mockLiveRoom(lineup);
      state.liveOpponentSlots = null;
      state.livePendingChoice = null;
      state.liveRoundRequests.clear();
      return json(route, state.liveRoom);
    }
    if (url.pathname === "/rest/v1/rpc/purchase_card") {
      state.purchaseCallCount += 1;
      if (options.purchaseDelayMs) await new Promise((resolve) => setTimeout(resolve, options.purchaseDelayMs));
      if (options.purchaseError) return databaseError(route, "Purchase service temporarily unavailable", 503);
      const body = request.postDataJSON() as { client_request_id: string; offer_id: string };
      const previous = state.purchases.get(body.client_request_id);
      if (previous) {
        if (previous.offerId !== body.offer_id) return databaseError(route, "Purchase request id was already used for a different offer.");
        return json(route, {
          status: "already-processed",
          request_id: previous.requestId,
          offer_id: previous.offerId,
          card_id: previous.cardId,
          price: previous.price,
          credits: state.credits,
          quantity: state.cards.get(previous.cardId)?.quantity ?? 0,
          purchased_at: previous.purchasedAt,
        });
      }
      const offer = currentOffers(state, marketEventRotation, marketNow).find((candidate) => candidate.offer_id === body.offer_id);
      if (!offer) return databaseError(route, "Offer is not available.");
      if (state.credits < offer.price) return databaseError(route, "Not enough Credits.");
      state.credits -= offer.price;
      const owned = state.cards.get(offer.card_id);
      const quantity = (owned?.quantity ?? 0) + 1;
      state.cards.set(offer.card_id, { quantity, acquiredAt: owned?.acquiredAt ?? mockNow });
      const receipt = { requestId: body.client_request_id, offerId: body.offer_id, cardId: offer.card_id, price: offer.price, purchasedAt: mockNow };
      state.purchases.set(receipt.requestId, receipt);
      return json(route, {
        status: "purchased",
        request_id: receipt.requestId,
        offer_id: receipt.offerId,
        card_id: receipt.cardId,
        price: receipt.price,
        credits: state.credits,
        quantity,
        purchased_at: receipt.purchasedAt,
      });
    }
    if (url.pathname === "/rest/v1/rpc/save_lineup") {
      state.lineupSaveCallCount += 1;
      if (options.lineupSaveError) return databaseError(route, "Lineup service temporarily unavailable", 503);
      const raw = request.postDataJSON() as Record<string, unknown>;
      const lineupId = (raw.lineup_id as string | null) ?? null;
      const name = String(raw.lineup_name ?? raw.name ?? "").trim();
      const mode = String(raw.lineup_mode ?? raw.mode ?? "") as GameMode;
      const slots = (raw.lineup_slots ?? raw.slots) as Record<LineupSlot, string>;
      if (!slots || Object.keys(slots).sort().join(",") !== ["C", "G", "LD", "LW", "RD", "RW"].join(",")) {
        return databaseError(route, "A lineup must contain exactly LW, C, RW, LD, RD, and G.");
      }
      const validation = validateLineup({ id: lineupId ?? "draft", name, mode, slots }, gameCatalog);
      const required = new Map<string, number>();
      Object.values(slots).forEach((cardId) => required.set(cardId, (required.get(cardId) ?? 0) + 1));
      const ownsAll = [...required].every(([cardId, quantity]) => (state.cards.get(cardId)?.quantity ?? 0) >= quantity);
      if (!validation.valid || !ownsAll) return databaseError(route, validation.issues[0]?.message ?? "Lineup contains a card quantity the user does not own.");
      const existing = lineupId ? state.lineups.get(lineupId) : null;
      const id = lineupId ?? `44444444-4444-4444-8444-${String(state.lineupSaveCallCount).padStart(12, "0")}`;
      const saved: MockLineup = {
        id,
        name,
        mode,
        isActive: existing?.mode === mode ? existing.isActive : false,
        slots: { ...slots },
        createdAt: existing?.createdAt ?? mockNow,
        updatedAt: mockNow,
      };
      state.lineups.set(id, saved);
      return json(route, { status: "saved", lineup: rpcLineup(saved) });
    }
    if (url.pathname === "/rest/v1/rpc/activate_lineup") {
      const body = request.postDataJSON() as { lineup_id: string };
      const target = state.lineups.get(body.lineup_id);
      if (!target) return databaseError(route, "Lineup not found.", 404);
      for (const lineup of state.lineups.values()) {
        if (lineup.mode === target.mode) lineup.isActive = lineup.id === target.id;
      }
      return json(route, { status: "activated", lineup: rpcLineup(target) });
    }
    if (url.pathname === "/rest/v1/rpc/claim_rivalry_reward") {
      const body = request.postDataJSON() as { client_request_id: string; card_id: string };
      const previous = state.rewardClaims.get(body.client_request_id);
      if (previous) {
        return json(route, { status: "already-claimed", request_id: body.client_request_id, card_id: previous.cardId, quantity: state.cards.get(previous.cardId)?.quantity ?? 1, claimed_at: previous.claimedAt });
      }
      if (state.rivalryRoad.status !== "choice-pending" || !RIVALRY_REWARD_CARD_IDS.includes(body.card_id as never)) {
        return databaseError(route, "Rivalry Road reward is not available.");
      }
      const owned = state.cards.get(body.card_id);
      const quantity = (owned?.quantity ?? 0) + 1;
      state.cards.set(body.card_id, { quantity, acquiredAt: owned?.acquiredAt ?? mockNow });
      state.rewardClaims.set(body.client_request_id, { cardId: body.card_id, claimedAt: mockNow });
      state.rivalryRoad = { ...state.rivalryRoad, status: "complete", selected_card_id: body.card_id, updated_at: mockNow };
      return json(route, { status: "claimed", request_id: body.client_request_id, card_id: body.card_id, quantity, claimed_at: mockNow });
    }
    if (url.pathname === "/rest/v1/rpc/get_public_rivalry_challenge") {
      const body = request.postDataJSON() as { challenge_slug: string };
      const challenge = state.rivalryChallenges.get(body.challenge_slug.toLowerCase());
      if (!challenge) return json(route, { status: "missing" });
      return json(route, {
        status: challenge.status,
        slug: challenge.slug,
        creator_label: challenge.creatorLabel,
        mode: challenge.mode,
        difficulty: challenge.difficulty,
        challenge_strength: challenge.challengeStrength,
        created_at: challenge.createdAt,
        expires_at: challenge.expiresAt,
      });
    }
    if (url.pathname === "/rest/v1/rpc/create_rivalry_challenge") {
      const body = request.postDataJSON() as { client_request_id: string; source_client_match_id: string; source_kind: "ai-match" | "ghost-challenge" };
      const existing = [...state.rivalryChallenges.values()].find((challenge) => challenge.owned && challenge.slug === createHash("md5").update(body.client_request_id).digest("hex"));
      if (existing) return json(route, { status: "already-created", challenge_id: `challenge:${existing.slug}`, slug: existing.slug, expires_at: existing.expiresAt, challenge_status: existing.status });
      const ticket = state.matchTickets.get(body.source_client_match_id);
      if (!ticket || ticket.status !== "settled" || ticket.rounds.size !== 5) return databaseError(route, "A settled match is required to create a challenge.");
      const slug = createHash("md5").update(body.client_request_id).digest("hex");
      const strength = Math.round(Object.values(ticket.playerSlots).reduce((total, cardId) => total + (catalogCards.get(cardId)?.overall ?? 0), 0) / 6);
      const challenge: MockRivalryChallenge = {
        slug,
        creatorLabel: "Alex",
        owned: true,
        mode: ticket.mode,
        difficulty: ticket.difficulty,
        challengeStrength: strength,
        playerLineupName: ticket.playerLineupName,
        playerSlots: { ...ticket.playerSlots },
        ghostSelections: [...ticket.rounds.values()].sort((left, right) => left.roundIndex - right.roundIndex).map((round) => ({ cardId: round.playerCardId, slot: round.playerSlot })),
        status: "active",
        createdAt: mockNow,
        expiresAt: "2026-08-13T12:00:00.000Z",
        attempts: 0,
        completed: 0,
        ghostDefenses: 0,
        challengerWins: 0,
      };
      state.rivalryChallenges.set(slug, challenge);
      return json(route, { status: "created", challenge_id: `challenge:${slug}`, slug, expires_at: challenge.expiresAt, challenge_status: "active" });
    }
    if (url.pathname === "/rest/v1/rpc/list_rivalry_challenges") {
      return json(route, { created: [...state.rivalryChallenges.values()].filter((challenge) => challenge.owned).map((challenge) => ({
        slug: challenge.slug, creator_label: challenge.creatorLabel, mode: challenge.mode, difficulty: challenge.difficulty,
        challenge_strength: challenge.challengeStrength, status: challenge.status, created_at: challenge.createdAt, expires_at: challenge.expiresAt,
        attempts: challenge.attempts, completed: challenge.completed, ghost_defenses: challenge.ghostDefenses, challenger_wins: challenge.challengerWins,
      })) });
    }
    if (url.pathname === "/rest/v1/rpc/revoke_rivalry_challenge") {
      const body = request.postDataJSON() as { challenge_slug: string };
      const challenge = state.rivalryChallenges.get(body.challenge_slug);
      if (!challenge?.owned) return databaseError(route, "Challenge not found.", 404);
      const alreadyRevoked = challenge.status === "revoked";
      challenge.status = "revoked";
      return json(route, { status: alreadyRevoked ? "already-revoked" : "revoked", slug: challenge.slug });
    }
    if (url.pathname === "/rest/v1/rpc/abandon_match"
      || url.pathname === "/rest/v1/rpc/abandon_arena_match"
      || url.pathname === "/rest/v1/rpc/abandon_rivalry_challenge") {
      if (failAbandonmentOnce) {
        failAbandonmentOnce = false;
        return databaseError(route, "Abandonment service temporarily unavailable", 503);
      }
      const body = request.postDataJSON() as { client_match_id: string };
      const ticket = state.matchTickets.get(body.client_match_id);
      if (!ticket) return databaseError(route, "A valid server-issued match ticket is required.");
      if (ticket.status === "settled") return json(route, { status: "already-settled" });
      if (ticket.status === "abandoned") return json(route, { status: "already-abandoned" });
      ticket.status = "abandoned";
      return json(route, { status: "abandoned" });
    }
    if (url.pathname === "/rest/v1/rpc/start_rivalry_challenge") {
      const body = request.postDataJSON() as { challenge_slug: string; client_match_id: string; lineup_id: string };
      const challenge = state.rivalryChallenges.get(body.challenge_slug);
      if (!challenge || challenge.status !== "active") return databaseError(route, "Challenge is no longer active.");
      const previous = state.matchTickets.get(body.client_match_id);
      if (previous) return json(route, startResponse("already-started", previous));
      const activeLineup = state.lineups.get(body.lineup_id);
      if (!activeLineup || !activeLineup.isActive || activeLineup.mode !== challenge.mode) return databaseError(route, "An active lineup for the challenge mode is required.");
      const ticket: MatchTicket = {
        clientMatchId: body.client_match_id,
        mode: challenge.mode,
        difficulty: challenge.difficulty,
        seed: `ghost-seed:${body.client_match_id}`,
        opponentId: `challenge:${challenge.slug}`,
        opponentName: `${challenge.creatorLabel}'s Ghost`,
        playerLineupId: activeLineup.id,
        playerLineupName: activeLineup.name,
        playerSlots: { ...activeLineup.slots },
        // The start response is deliberately masked with cards the challenger
        // already knows. Actual ghost identities arrive only in round reveals.
        opponentSlots: { ...activeLineup.slots },
        rounds: new Map(), roundRequests: new Map(), status: "open",
      };
      state.matchTickets.set(ticket.clientMatchId, ticket);
      state.ghostAttemptSlugs.set(ticket.clientMatchId, challenge.slug);
      challenge.attempts += 1;
      if (dropRivalryStartResponseOnce) {
        dropRivalryStartResponseOnce = false;
        await route.abort("failed");
        return;
      }
      return json(route, startResponse("started", ticket));
    }
    if (url.pathname === "/rest/v1/rpc/start_arena_match") {
      const body = request.postDataJSON() as { client_match_id: string; mode: GameMode };
      const previous = state.matchTickets.get(body.client_match_id);
      if (previous) return json(route, startResponse("already-started", previous));
      const activeLineup = [...state.lineups.values()].find((lineup) => lineup.mode === body.mode && lineup.isActive);
      if (!activeLineup) return databaseError(route, "An active lineup is required for this Arena.");
      const ticket: MatchTicket = {
        clientMatchId: body.client_match_id,
        mode: body.mode,
        difficulty: "pro",
        seed: `arena-seed:${body.client_match_id}`,
        opponentId: "arena:22222222-2222-4222-8222-222222222222",
        opponentName: "Morgan's Six",
        playerLineupId: activeLineup.id,
        playerLineupName: activeLineup.name,
        playerSlots: { ...activeLineup.slots },
        opponentSlots: { ...activeLineup.slots },
        rounds: new Map(), roundRequests: new Map(), status: "open",
      };
      state.matchTickets.set(ticket.clientMatchId, ticket);
      return json(route, startResponse("started", ticket));
    }
    if (url.pathname === "/rest/v1/rpc/start_match") {
      state.startMatchCallCount += 1;
      if (options.startMatchError) return databaseError(route, "Match service temporarily unavailable", 503);
      const raw = request.postDataJSON() as Record<string, string>;
      const clientMatchId = raw.client_match_id;
      const mode = (raw.mode ?? raw.match_mode) as GameMode;
      const difficulty = (raw.difficulty ?? raw.match_difficulty) as AiDifficulty;
      const previous = state.matchTickets.get(clientMatchId);
      if (previous) {
        if (previous.status !== "open") return databaseError(route, "Match id is no longer active.");
        if (previous.mode !== mode || previous.difficulty !== difficulty) return databaseError(route, "Match id was already started with different match data.");
        return json(route, startResponse("already-started", previous));
      }
      const openTicket = [...state.matchTickets.values()].find((ticket) => ticket.status === "open");
      if (openTicket) {
        if (openTicket.mode !== mode || openTicket.difficulty !== difficulty) {
          return databaseError(route, "Another match is already in progress with a different mode or difficulty.");
        }
        return json(route, startResponse("already-started", openTicket));
      }
      const seed = options.matchSeed ?? `mock-seed:${clientMatchId}`;
      const opponent = selectAiOpponent(mode, difficulty, seed);
      const opponentSlots = mockOpponentSlots(opponent, seed);
      const activeLineup = [...state.lineups.values()].find((lineup) => lineup.mode === mode && lineup.isActive);
      if (!activeLineup) return databaseError(route, "An active lineup is required for this mode.");
      const ticket: MatchTicket = {
        clientMatchId,
        mode,
        difficulty,
        seed,
        opponentId: opponent.id,
        opponentName: opponent.name,
        playerLineupId: activeLineup.id,
        playerLineupName: activeLineup.name,
        playerSlots: { ...activeLineup.slots },
        opponentSlots,
        rounds: new Map(),
        roundRequests: new Map(),
        status: "open",
      };
      state.matchTickets.set(clientMatchId, ticket);
      return json(route, startResponse("started", ticket));
    }
    if (url.pathname === "/rest/v1/rpc/play_match_round" || url.pathname === "/rest/v1/rpc/play_rivalry_challenge_round" || url.pathname === "/rest/v1/rpc/play_arena_match_round") {
      state.playRoundCallCount += 1;
      if (options.roundDelayMs) await new Promise((resolve) => setTimeout(resolve, options.roundDelayMs));
      if (options.roundError) return databaseError(route, "Round service temporarily unavailable", 503);
      const body = request.postDataJSON() as { client_match_id: string; round_index: number; player_card_id: string; client_request_id: string };
      const ticket = state.matchTickets.get(body.client_match_id);
      if (!ticket || ticket.status !== "open") return databaseError(route, "A valid server-issued match ticket is required.");
      const previousRequest = ticket.roundRequests.get(body.client_request_id);
      if (previousRequest) {
        if (previousRequest.roundIndex !== body.round_index || previousRequest.playerCardId !== body.player_card_id) {
          return databaseError(route, "Round request id was already used for different round data.");
        }
        return json(route, roundResponse("already-played", ticket, previousRequest));
      }
      if (ticket.rounds.size !== body.round_index || body.round_index < 0 || body.round_index > 4) {
        return databaseError(route, "Rounds must be played in order.");
      }
      const situation = serverSituations[body.round_index];
      const usedPlayerCards = new Set([...ticket.rounds.values()].map((round) => round.playerCardId));
      const playerEntry = Object.entries(ticket.playerSlots).find(([slot, cardId]) =>
        cardId === body.player_card_id && situation.eligible_slots.includes(slot as never) && !usedPlayerCards.has(cardId));
      if (!playerEntry) return databaseError(route, "Player card is missing, already used, or ineligible for this situation.");
      const ghostSlug = state.ghostAttemptSlugs.get(ticket.clientMatchId);
      const ghostSelection = ghostSlug ? state.rivalryChallenges.get(ghostSlug)?.ghostSelections[body.round_index] : undefined;
      const opponent = ghostSelection
        ? { ...ghostSelection, score: scoreCard(ghostSelection.cardId, situation.attribute) }
        : (() => {
            const usedOpponentCards = new Set([...ticket.rounds.values()].map((round) => round.opponentCardId));
            const opponentCandidates = Object.entries(ticket.opponentSlots)
              .filter(([slot, cardId]) => situation.eligible_slots.includes(slot as never) && !usedOpponentCards.has(cardId))
              .map(([slot, cardId]) => ({ slot: slot as LineupSlot, cardId, score: scoreCard(cardId, situation.attribute) }))
              .sort((left, right) => left.score.value - right.score.value || left.score.overall - right.score.overall || left.cardId.localeCompare(right.cardId));
            const pool = ticket.difficulty === "elite"
              ? opponentCandidates.slice(-1)
              : ticket.difficulty === "rookie"
                ? opponentCandidates.slice(0, Math.max(1, Math.ceil(opponentCandidates.length / 2)))
                : opponentCandidates.slice(Math.floor(opponentCandidates.length / 2));
            return ticket.difficulty === "elite" ? pool[0] : pool[deterministicIndex(`${ticket.seed}:${body.round_index}:${ticket.difficulty}`, pool.length)];
          })();
      if (!opponent) return databaseError(route, "Server opponent has no eligible card for this situation.");
      const playerScore = scoreCard(body.player_card_id, situation.attribute);
      const tieBreaker = playerScore.value !== opponent.score.value
        ? "category"
        : playerScore.overall !== opponent.score.overall ? "overall" : "match-seed";
      const winner = playerScore.value !== opponent.score.value
        ? playerScore.value > opponent.score.value ? "player" : "opponent"
        : playerScore.overall !== opponent.score.overall
          ? playerScore.overall > opponent.score.overall ? "player" : "opponent"
          : deterministicIndex(`${ticket.seed}:round:${body.round_index}:tie`, 2) === 0 ? "player" : "opponent";
      const receipt: MockRoundReceipt = {
        clientRequestId: body.client_request_id,
        roundIndex: body.round_index,
        situationId: situation.id,
        playerCardId: body.player_card_id,
        playerSlot: playerEntry[0] as LineupSlot,
        playerScore: playerScore.value,
        opponentCardId: opponent.cardId,
        opponentSlot: opponent.slot,
        opponentScore: opponent.score.value,
        winner,
        tieBreaker,
        transcript: { situation, player: playerScore, opponent: opponent.score, tie_breaker: tieBreaker },
      };
      ticket.rounds.set(body.round_index, receipt);
      ticket.roundRequests.set(body.client_request_id, receipt);
      if (dropRoundResponseOnce) {
        dropRoundResponseOnce = false;
        await route.abort("failed");
        return;
      }
      return json(route, roundResponse("played", ticket, receipt));
    }
    if (url.pathname === "/rest/v1/rpc/settle_match" || url.pathname === "/rest/v1/rpc/settle_rivalry_challenge" || url.pathname === "/rest/v1/rpc/settle_arena_match") {
      const isGhostSettlement = url.pathname.endsWith("settle_rivalry_challenge");
      state.settleMatchCallCount += 1;
      if (failSettlementOnce) {
        failSettlementOnce = false;
        return databaseError(route, "Match settlement temporarily unavailable", 503);
      }
      if (options.settlementError) return databaseError(route, "Match settlement temporarily unavailable", 503);
      const body = request.postDataJSON() as { client_match_id: string };
      if (isGhostSettlement) {
        const previousGhost = state.ghostSettlements.get(body.client_match_id);
        if (previousGhost) return json(route, { status: "already-settled", challenge_id: `challenge:${state.ghostAttemptSlugs.get(body.client_match_id)}`, attempt_id: `attempt:${body.client_match_id}`, ...previousGhost, ghost_wins: previousGhost.ghostWins, player_wins: previousGhost.playerWins });
        const ghostTicket = state.matchTickets.get(body.client_match_id);
        if (!ghostTicket || ghostTicket.status !== "open" || ghostTicket.rounds.size !== 5) return databaseError(route, "All five challenge rounds must be played before settlement.");
        const playerWins = [...ghostTicket.rounds.values()].filter((round) => round.winner === "player").length;
        const ghostWins = 5 - playerWins;
        const outcome = playerWins > ghostWins ? "win" as const : "loss" as const;
        ghostTicket.status = "settled";
        state.ghostSettlements.set(body.client_match_id, { outcome, playerWins, ghostWins });
        const challenge = state.rivalryChallenges.get(state.ghostAttemptSlugs.get(body.client_match_id) ?? "");
        if (challenge) {
          challenge.completed += 1;
          if (outcome === "win") challenge.challengerWins += 1;
          else challenge.ghostDefenses += 1;
        }
        return json(route, { status: "settled", challenge_id: `challenge:${challenge?.slug ?? "missing"}`, attempt_id: `attempt:${body.client_match_id}`, outcome, player_wins: playerWins, ghost_wins: ghostWins });
      }
      const previous = state.settlements.get(body.client_match_id);
      if (previous) {
        return json(route, { status: "already-settled", match_id: previous.matchId, reward_credits: previous.rewardCredits, credits: state.credits, completed_matches: state.completedMatches });
      }
      const ticket = state.matchTickets.get(body.client_match_id);
      if (!ticket || ticket.status !== "open") return databaseError(route, "A valid server-issued match ticket is required.");
      if (ticket.rounds.size !== 5) return databaseError(route, "All five server rounds must be played before settlement.");
      const playerWins = [...ticket.rounds.values()].filter((round) => round.winner === "player").length;
      const opponentWins = [...ticket.rounds.values()].filter((round) => round.winner === "opponent").length;
      const outcome = playerWins === opponentWins ? "draw" : playerWins > opponentWins ? "win" : "loss";
      return json(route, completeSettlement(state, { client_match_id: body.client_match_id, match_mode: ticket.mode, match_difficulty: ticket.difficulty, match_outcome: outcome }));
    }
    return json(route, { message: `Unhandled Supabase mock request: ${request.method()} ${url.pathname}` }, 500);
  });
  return state;
}
