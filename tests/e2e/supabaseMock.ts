import type { Page, Route } from "@playwright/test";

import { selectAiOpponent, type AiDifficulty } from "../../src/domain/battle";
import { validateLineup, type GameMode, type LineupSlot } from "../../src/domain/lineups";
import { RIVALRY_REWARD_CARD_IDS } from "../../src/domain/progression";
import { resolveEventCalendarRotation } from "../../src/domain/shop";
import { gameCatalog } from "../../src/data/generated/gameCatalog";

const projectRef = "zsyoxpirfxajkruqeqam";
const userId = "11111111-1111-4111-8111-111111111111";
const starterLineupId = "33333333-3333-4333-8333-333333333333";
const mockNow = "2026-07-13T12:00:00.000Z";
const mockEventRotation = resolveEventCalendarRotation(gameCatalog.cards, new Date(mockNow));

const starterCards = [
  ["LW", "nhl-brady-tkachuk-base"],
  ["C", "nhl-connor-mcdavid-base"],
  ["RW", "nhl-mikko-rantanen-base"],
  ["LD", "nhl-rasmus-dahlin-base"],
  ["RD", "nhl-evan-bouchard-base"],
  ["G", "nhl-igor-shesterkin-base"],
] as const;

const serverSituations = [
  { id: "transition-rush", name: "Transition Rush", description: "Attack with pace and finish off the rush.", role: "skater", eligible_slots: ["LW", "C", "RW"], weights: { speed: 0.3, shooting: 0.3, puckControl: 0.2, hockeyIq: 0.1, clutch: 0.1 } },
  { id: "cycle-pressure", name: "Cycle Pressure", description: "Hold possession and create through sustained pressure.", role: "skater", eligible_slots: ["LW", "C", "RW"], weights: { passing: 0.25, puckControl: 0.3, physicality: 0.15, hockeyIq: 0.2, clutch: 0.1 } },
  { id: "blue-line-command", name: "Blue Line Command", description: "Control the point with a complete defender.", role: "skater", eligible_slots: ["LD", "RD"], weights: { defense: 0.3, passing: 0.2, shooting: 0.15, physicality: 0.15, hockeyIq: 0.2 } },
  { id: "late-game-shift", name: "Late Game Shift", description: "Make the decisive play under late-game pressure.", role: "skater", eligible_slots: ["LW", "C", "RW", "LD", "RD"], weights: { clutch: 0.3, hockeyIq: 0.25, speed: 0.15, puckControl: 0.15, defense: 0.15 } },
  { id: "crease-under-fire", name: "Crease Under Fire", description: "Own the crease during a final barrage.", role: "goalie", eligible_slots: ["G"], weights: { reflexes: 0.2, positioning: 0.2, glove: 0.1, blocker: 0.1, reboundControl: 0.15, consistency: 0.15, clutch: 0.1 } },
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
  status: "open" | "settled";
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
  transcript: {
    situation: (typeof serverSituations)[number];
    player: { base: number; variance: number; total: number };
    opponent: { base: number; variance: number; total: number };
  };
};

export interface SupabaseMockOptions {
  readonly authenticated?: boolean;
  readonly onboardingCompleted?: boolean;
  readonly duplicateClaim?: boolean;
  readonly loginError?: boolean;
  readonly profileError?: boolean;
  readonly purchaseError?: boolean;
  readonly purchaseDelayMs?: number;
  readonly lineupSaveError?: boolean;
  readonly startMatchError?: boolean;
  readonly roundError?: boolean;
  readonly roundResponseLossOnce?: boolean;
  readonly roundDelayMs?: number;
  readonly settlementError?: boolean;
  readonly state?: SupabaseMockState;
}

export interface SupabaseMockState {
  onboardingCompleted: boolean;
  credits: number;
  completedMatches: number;
  cards: Map<string, { quantity: number; acquiredAt: string }>;
  lineups: Map<string, MockLineup>;
  purchases: Map<string, PurchaseReceipt>;
  matchTickets: Map<string, MatchTicket>;
  settlements: Map<string, { matchId: string; rewardCredits: number; outcome: "win" | "draw" | "loss" }>;
  rewardClaims: Map<string, { cardId: string; claimedAt: string }>;
  objectives: Array<Record<string, unknown>>;
  rivalryRoad: { user_id: string; current_step_index: number; completed_step_ids: string[]; status: string; selected_card_id: string | null; updated_at: string };
  eventEndsAt: string;
  purchaseCallCount: number;
  lineupSaveCallCount: number;
  startMatchCallCount: number;
  playRoundCallCount: number;
  settleMatchCallCount: number;
}

function starterLineup(): MockLineup {
  return {
    id: starterLineupId,
    name: "Edmonton Oilers Starter",
    mode: "nhl-circuit",
    isActive: true,
    slots: Object.fromEntries(starterCards) as Record<LineupSlot, string>,
    createdAt: mockNow,
    updatedAt: mockNow,
  };
}

function provisionStarter(state: SupabaseMockState): void {
  for (const [, cardId] of starterCards) {
    state.cards.set(cardId, { quantity: 1, acquiredAt: mockNow });
  }
  state.lineups.set(starterLineupId, starterLineup());
}

export function createSupabaseMockState(onboardingCompleted = true): SupabaseMockState {
  const state: SupabaseMockState = {
    onboardingCompleted,
    credits: onboardingCompleted ? 1000 : 0,
    completedMatches: 0,
    cards: new Map(),
    lineups: new Map(),
    purchases: new Map(),
    matchTickets: new Map(),
    settlements: new Map(),
    rewardClaims: new Map(),
    objectives: [],
    rivalryRoad: { user_id: userId, current_step_index: 0, completed_step_ids: [], status: "in-progress", selected_card_id: null, updated_at: mockNow },
    eventEndsAt: mockEventRotation.shop.endsAt,
    purchaseCallCount: 0,
    lineupSaveCallCount: 0,
    startMatchCallCount: 0,
    playRoundCallCount: 0,
    settleMatchCallCount: 0,
  };
  if (onboardingCompleted) provisionStarter(state);
  return state;
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

function queryValue(url: URL, field: string, operator: "eq" | "in"): string | null {
  const raw = url.searchParams.get(field);
  const prefix = `${operator}.`;
  return raw?.startsWith(prefix) ? raw.slice(prefix.length) : null;
}

function currentOffers(state: SupabaseMockState) {
  const baseOffers = gameCatalog.cards
    .filter((card) => card.isPermanent)
    .map((card) => ({
      offer_id: `base-market:${card.id}`,
      card_id: card.id,
      source: "base_market",
      regular_price: card.price,
      price: card.price,
      event_id: null,
      placement: "standard",
      owned_quantity: state.cards.get(card.id)?.quantity ?? 0,
    }));
  if (Date.parse(state.eventEndsAt) <= Date.parse(mockNow)) return baseOffers;
  const eventOffers = mockEventRotation.shop.offers.map((offer) => ({
    offer_id: `event-shop:${mockEventRotation.event.id}:${mockEventRotation.shop.startsAt.slice(0, 10)}:${offer.cardId}`,
    card_id: offer.cardId,
    source: "event_shop",
    regular_price: offer.regularPrice,
    price: offer.price,
    event_id: mockEventRotation.event.id,
    placement: offer.placement,
    owned_quantity: state.cards.get(offer.cardId)?.quantity ?? 0,
  }));
  return [...baseOffers, ...eventOffers];
}

function deterministicVariance(key: string): number {
  let hash = 0;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return Math.round((((Math.abs(hash) % 501) - 250) / 100) * 100) / 100;
}

function scoreCard(cardId: string, weights: Readonly<Record<string, number>>, varianceKey: string) {
  const card = gameCatalog.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown mock card ${cardId}.`);
  const attributes = card.attributes as unknown as Record<string, number>;
  const base = Math.round(Object.entries(weights).reduce((total, [attribute, weight]) => total + (attributes[attribute] ?? 0) * weight, 0) * 100) / 100;
  const variance = deterministicVariance(varianceKey);
  return { base, variance, total: Math.round((base + variance) * 100) / 100 };
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
    { user_id: userId, objective_id: "daily-match-complete", period_key: "2026-07-13", current: 1, target: 1, completed_modes: [], completed_at: mockNow, reward_credits: 75, updated_at: mockNow },
    ...(body.match_outcome === "win" ? [{ user_id: userId, objective_id: "daily-match-win", period_key: "2026-07-13", current: 1, target: 1, completed_modes: [], completed_at: mockNow, reward_credits: 100, updated_at: mockNow }] : []),
    { user_id: userId, objective_id: "weekly-circuit-tour", period_key: "2026-07-13", current: 1, target: 5, completed_modes: [body.match_mode], completed_at: null, reward_credits: 350, updated_at: mockNow },
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
  const state = options.state ?? createSupabaseMockState(options.onboardingCompleted ?? true);
  let dropRoundResponseOnce = options.roundResponseLossOnce ?? false;
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
        favorite_team_id: state.onboardingCompleted ? "edmonton-oilers" : null,
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
      if (options.duplicateClaim) return databaseError(route, "Starter team has already been claimed.");
      state.onboardingCompleted = true;
      state.credits = 1000;
      provisionStarter(state);
      return json(route, starterLineupId);
    }
    if (url.pathname === "/rest/v1/rpc/get_market_state") {
      const activeEvent = Date.parse(state.eventEndsAt) > Date.parse(mockNow);
      return json(route, {
        server_time: mockNow,
        current_event: activeEvent ? {
          id: mockEventRotation.event.id,
          name: mockEventRotation.event.name,
          description: mockEventRotation.event.description,
          starts_at: mockEventRotation.shop.startsAt,
          ends_at: state.eventEndsAt,
          visual_metadata: mockEventRotation.event.visual,
        } : null,
        offers: currentOffers(state),
      });
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
      const offer = currentOffers(state).find((candidate) => candidate.offer_id === body.offer_id);
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
      const seed = `mock-seed:${clientMatchId}`;
      const opponent = selectAiOpponent(mode, difficulty, seed);
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
        opponentSlots: { ...opponent.lineup.slots },
        rounds: new Map(),
        roundRequests: new Map(),
        status: "open",
      };
      state.matchTickets.set(clientMatchId, ticket);
      return json(route, startResponse("started", ticket));
    }
    if (url.pathname === "/rest/v1/rpc/play_match_round") {
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
      const usedPlayerSlots = new Set([...ticket.rounds.values()].map((round) => round.playerSlot));
      const playerEntry = Object.entries(ticket.playerSlots).find(([slot, cardId]) =>
        cardId === body.player_card_id && situation.eligible_slots.includes(slot as never) && !usedPlayerSlots.has(slot as LineupSlot));
      if (!playerEntry) return databaseError(route, "Player card is missing, already used, or ineligible for this situation.");
      const usedOpponentSlots = new Set([...ticket.rounds.values()].map((round) => round.opponentSlot));
      const opponentCandidates = Object.entries(ticket.opponentSlots)
        .filter(([slot]) => situation.eligible_slots.includes(slot as never) && !usedOpponentSlots.has(slot as LineupSlot))
        .map(([slot, cardId]) => ({ slot: slot as LineupSlot, cardId, score: scoreCard(cardId, situation.weights, `${ticket.seed}:${body.round_index}:opponent:${cardId}`) }));
      opponentCandidates.sort((left, right) => ticket.difficulty === "rookie"
        ? left.score.base - right.score.base
        : ticket.difficulty === "elite"
          ? right.score.base - left.score.base
          : left.cardId.localeCompare(right.cardId));
      const opponent = opponentCandidates[0];
      if (!opponent) return databaseError(route, "Server opponent has no eligible card for this situation.");
      const playerScore = scoreCard(body.player_card_id, situation.weights, `${ticket.seed}:${body.round_index}:player:${body.player_card_id}`);
      const winner = playerScore.total === opponent.score.total ? "tie" : playerScore.total > opponent.score.total ? "player" : "opponent";
      const receipt: MockRoundReceipt = {
        clientRequestId: body.client_request_id,
        roundIndex: body.round_index,
        situationId: situation.id,
        playerCardId: body.player_card_id,
        playerSlot: playerEntry[0] as LineupSlot,
        playerScore: playerScore.total,
        opponentCardId: opponent.cardId,
        opponentSlot: opponent.slot,
        opponentScore: opponent.score.total,
        winner,
        transcript: { situation, player: playerScore, opponent: opponent.score },
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
    if (url.pathname === "/rest/v1/rpc/settle_match") {
      state.settleMatchCallCount += 1;
      if (options.settlementError) return databaseError(route, "Match settlement temporarily unavailable", 503);
      const body = request.postDataJSON() as { client_match_id: string };
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
