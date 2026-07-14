import { describe, expect, it, vi } from "vitest";

import { SupabaseAccountRepository } from "./AccountRepository";

function repositoryWithRpc(responses: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => ({
    data: responses[name] ?? null,
    error: responses[name] === undefined ? { message: `Missing response for ${name}` } : null,
  }));
  return {
    repository: new SupabaseAccountRepository({ rpc } as never),
    rpc,
  };
}

const lineup = {
  id: "lineup-1",
  name: "Cloud Six",
  mode: "nhl-circuit",
  is_active: true,
  slots: { LW: "lw", C: "c", RW: "rw", LD: "ld", RD: "rd", G: "g" },
};

const situations = [
  { id: "transition-rush", name: "Transition Rush", description: "Attack with pace.", role: "skater", eligible_slots: ["LW", "C", "RW"], weights: { speed: 1 } },
  { id: "cycle-pressure", name: "Cycle Pressure", description: "Hold possession.", role: "skater", eligible_slots: ["LW", "C", "RW"], weights: { passing: 1 } },
  { id: "blue-line-command", name: "Blue Line Command", description: "Control the point.", role: "skater", eligible_slots: ["LD", "RD"], weights: { defense: 1 } },
  { id: "late-game-shift", name: "Late Game Shift", description: "Make the play.", role: "skater", eligible_slots: ["LW", "C", "RW", "LD", "RD"], weights: { clutch: 1 } },
  { id: "crease-under-fire", name: "Crease Under Fire", description: "Own the crease.", role: "goalie", eligible_slots: ["G"], weights: { reflexes: 1 } },
];

const roundPayload = {
  status: "played",
  client_match_id: "match-1",
  round_index: 0,
  situation_id: "transition-rush",
  player_card_id: "lw",
  player_slot: "LW",
  player_score: 91.2,
  opponent_card_id: "opp-lw",
  opponent_slot: "LW",
  opponent_score: 89.1,
  winner: "player",
  transcript: {
    situation: situations[0],
    player: { base: 90, variance: 1.2, total: 91.2 },
    opponent: { base: 89, variance: 0.1, total: 89.1 },
  },
};

describe("SupabaseAccountRepository RPC mapping", () => {
  it("maps the server-authoritative market state", async () => {
    const { repository, rpc } = repositoryWithRpc({
      get_market_state: {
        server_time: "2026-07-13T12:00:00.000Z",
        current_event: {
          id: "signature-series",
          name: "Signature Series",
          description: "Distinctive stars.",
          starts_at: "2026-07-10T00:00:00.000Z",
          ends_at: "2026-07-17T00:00:00.000Z",
          visual_metadata: { accent: "gold" },
        },
        offers: [{
          offer_id: "event:signature:card-1",
          card_id: "card-1",
          source: "event_shop",
          regular_price: 2_000,
          price: 1_700,
          event_id: "signature-series",
          placement: "spotlight",
          starts_at: "2026-07-10T00:00:00.000Z",
          ends_at: "2026-07-17T00:00:00.000Z",
          owned_quantity: 2,
        }],
      },
    });

    await expect(repository.loadMarketState()).resolves.toMatchObject({
      serverTime: "2026-07-13T12:00:00.000Z",
      currentEvent: { id: "signature-series", visualMetadata: { accent: "gold" } },
      offers: [{
        id: "event:signature:card-1",
        price: 1_700,
        regularPrice: 2_000,
        placement: "spotlight",
        startsAt: "2026-07-10T00:00:00.000Z",
        endsAt: "2026-07-17T00:00:00.000Z",
        ownedQuantity: 2,
      }],
    });
    expect(rpc).toHaveBeenCalledWith("get_market_state", undefined);
  });

  it("passes only request and offer ids to purchases and maps the receipt", async () => {
    const { repository, rpc } = repositoryWithRpc({
      purchase_card: {
        status: "purchased",
        request_id: "request-1",
        offer_id: "base:card-1",
        card_id: "card-1",
        price: 700,
        credits: 300,
        quantity: 1,
        purchased_at: "2026-07-13T12:00:00.000Z",
      },
    });

    await expect(repository.purchaseCard({ clientRequestId: "request-1", offerId: "base:card-1" })).resolves.toMatchObject({
      status: "purchased",
      cardId: "card-1",
      credits: 300,
    });
    expect(rpc).toHaveBeenCalledWith("purchase_card", {
      client_request_id: "request-1",
      offer_id: "base:card-1",
    });
  });

  it("maps lineup writes, activation, reward claims, and match tickets", async () => {
    const { repository, rpc } = repositoryWithRpc({
      save_lineup: { status: "saved", lineup },
      activate_lineup: { status: "activated", lineup },
      claim_rivalry_reward: {
        status: "claimed",
        request_id: "reward-request",
        card_id: "reward-card",
        quantity: 1,
        claimed_at: "2026-07-13T12:00:00.000Z",
      },
      start_match: {
        status: "already-started",
        client_match_id: "match-1",
        seed: "seed-1",
        opponent_id: "rookie-rival",
        opponent: { id: "rookie-rival", name: "Rookie Rival", mode: "nhl-circuit", slots: lineup.slots },
        lineup: { id: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots },
        situations,
        rounds: [{ ...roundPayload, status: "already-played" }],
        mode: "nhl-circuit",
        difficulty: "rookie",
      },
      play_match_round: roundPayload,
      settle_match: { status: "settled", match_id: "db-match-1", reward_credits: 345, credits: 1345, completed_matches: 1 },
    });
    const slots = lineup.slots;

    await expect(repository.saveLineup({ lineupId: "lineup-1", name: "Cloud Six", mode: "nhl-circuit", slots })).resolves.toMatchObject({ status: "saved", lineup: { id: "lineup-1" } });
    await expect(repository.activateLineup("lineup-1")).resolves.toMatchObject({ status: "activated", lineup: { isActive: true } });
    await expect(repository.claimRivalryReward({ clientRequestId: "reward-request", cardId: "reward-card" })).resolves.toMatchObject({ status: "claimed", quantity: 1 });
    await expect(repository.startMatch({ clientMatchId: "match-1", mode: "nhl-circuit", difficulty: "rookie" })).resolves.toMatchObject({ seed: "seed-1", opponentId: "rookie-rival", lineup: { id: "lineup-1", slots: lineup.slots }, rounds: [{ roundIndex: 0, status: "already-played" }] });
    await expect(repository.playMatchRound({ clientMatchId: "match-1", roundIndex: 0, playerCardId: "lw", clientRequestId: "round-request" })).resolves.toMatchObject({ winner: "player", transcript: { player: { total: 91.2 } } });
    await expect(repository.settleMatch({ clientMatchId: "match-1" })).resolves.toMatchObject({ status: "settled", rewardCredits: 345 });

    expect(rpc).toHaveBeenCalledWith("save_lineup", {
      lineup_id: "lineup-1",
      name: "Cloud Six",
      mode: "nhl-circuit",
      slots,
    });
    expect(rpc).toHaveBeenCalledWith("activate_lineup", { lineup_id: "lineup-1" });
    expect(rpc).toHaveBeenCalledWith("claim_rivalry_reward", { client_request_id: "reward-request", card_id: "reward-card" });
    expect(rpc).toHaveBeenCalledWith("start_match", { client_match_id: "match-1", mode: "nhl-circuit", difficulty: "rookie" });
    expect(rpc).toHaveBeenCalledWith("play_match_round", { client_match_id: "match-1", round_index: 0, player_card_id: "lw", client_request_id: "round-request" });
    expect(rpc).toHaveBeenCalledWith("settle_match", { client_match_id: "match-1" });
  });

  it("rejects malformed server payloads instead of inventing client defaults", async () => {
    const { repository } = repositoryWithRpc({
      get_market_state: { server_time: null, current_event: null, offers: [] },
      start_match: { status: "started", client_match_id: "match-1" },
    });
    await expect(repository.loadMarketState()).rejects.toThrow(/market server time/i);
    await expect(repository.startMatch({ clientMatchId: "match-1", mode: "nhl-circuit", difficulty: "rookie" })).rejects.toThrow(/difficulty/i);
  });

  it("rejects unknown mutation statuses and malformed settlement values", async () => {
    const { repository } = repositoryWithRpc({
      purchase_card: { status: "pending" },
      save_lineup: { status: "pending", lineup },
      activate_lineup: { status: "pending", lineup },
      claim_rivalry_reward: { status: "pending" },
      settle_match: { status: "settled", match_id: "", reward_credits: "not-a-number", credits: 100, completed_matches: 1 },
    });
    await expect(repository.purchaseCard({ clientRequestId: "request", offerId: "offer" })).rejects.toThrow(/purchase status/i);
    await expect(repository.saveLineup({ lineupId: "lineup-1", name: "Cloud Six", mode: "nhl-circuit", slots: lineup.slots })).rejects.toThrow(/save status/i);
    await expect(repository.activateLineup("lineup-1")).rejects.toThrow(/activation status/i);
    await expect(repository.claimRivalryReward({ clientRequestId: "request", cardId: "card" })).rejects.toThrow(/claim status/i);
    await expect(repository.settleMatch({ clientMatchId: "match-1" })).rejects.toThrow(/match id/i);
  });

  it("rejects unknown market source and placement values", async () => {
    const market = {
      server_time: "2026-07-13T12:00:00.000Z",
      current_event: null,
      offers: [{ offer_id: "offer", card_id: "card", source: "mystery", regular_price: 1, price: 1, event_id: null, placement: "standard", owned_quantity: 0 }],
    };
    const invalidSource = repositoryWithRpc({ get_market_state: market }).repository;
    await expect(invalidSource.loadMarketState()).rejects.toThrow(/offer source/i);
    const invalidPlacement = repositoryWithRpc({ get_market_state: {
      ...market,
      offers: [{ ...market.offers[0], source: "base_market", placement: "mystery" }],
    } }).repository;
    await expect(invalidPlacement.loadMarketState()).rejects.toThrow(/offer placement/i);
  });

  it("rejects an event offer without a valid server window", async () => {
    const { repository } = repositoryWithRpc({
      get_market_state: {
        server_time: "2026-07-13T12:00:00.000Z",
        current_event: null,
        offers: [{
          offer_id: "event:invalid-window",
          card_id: "card",
          source: "event_shop",
          regular_price: 2_000,
          price: 1_700,
          event_id: "signature-series",
          placement: "standard",
          starts_at: "2026-07-17T00:00:00.000Z",
          ends_at: "2026-07-10T00:00:00.000Z",
          owned_quantity: 0,
        }],
      },
    });

    await expect(repository.loadMarketState()).rejects.toThrow(/offer window/i);
  });

  it("rejects malformed resumed rounds and settlement numbers", async () => {
    const invalidRounds = repositoryWithRpc({
      start_match: {
        status: "already-started",
        client_match_id: "match-1",
        seed: "seed-1",
        opponent_id: "rookie-rival",
        opponent: { id: "rookie-rival", name: "Rookie Rival", mode: "nhl-circuit", slots: lineup.slots },
        lineup: { id: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots },
        situations,
        rounds: [{ ...roundPayload, status: "pending" }],
        mode: "nhl-circuit",
        difficulty: "rookie",
      },
    }).repository;
    await expect(invalidRounds.startMatch({ clientMatchId: "match-1", mode: "nhl-circuit", difficulty: "rookie" })).rejects.toThrow(/round status/i);

    const invalidSettlement = repositoryWithRpc({
      settle_match: { status: "settled", match_id: "db-match-1", reward_credits: "345", credits: 100, completed_matches: 1 },
    }).repository;
    await expect(invalidSettlement.settleMatch({ clientMatchId: "match-1" })).rejects.toThrow(/reward credits/i);
  });
});
