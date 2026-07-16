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
  { id: "skater-speed", name: "Speed", description: "Higher Speed wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW"], attribute: "speed" },
  { id: "skater-shooting", name: "Shooting", description: "Higher Shooting wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW"], attribute: "shooting" },
  { id: "skater-defense", name: "Defense", description: "Higher Defense wins this round.", role: "skater", eligible_slots: ["LD", "RD"], attribute: "defense" },
  { id: "skater-clutch", name: "Clutch", description: "Higher Clutch wins this round.", role: "skater", eligible_slots: ["LW", "C", "RW", "LD", "RD"], attribute: "clutch" },
  { id: "goalie-reflexes", name: "Reflexes", description: "Higher Reflexes wins this round.", role: "goalie", eligible_slots: ["G"], attribute: "reflexes" },
];

const roundPayload = {
  status: "played",
  client_match_id: "match-1",
  round_index: 0,
  situation_id: "skater-speed",
  player_card_id: "lw",
  player_slot: "LW",
  player_score: 90,
  opponent_card_id: "opp-lw",
  opponent_slot: "LW",
  opponent_score: 89,
  winner: "player",
  tie_breaker: "category",
  transcript: {
    situation: situations[0],
    player: { value: 90, overall: 86 },
    opponent: { value: 89, overall: 85 },
  },
};

const liveRoomPayload = {
  server_time: "2026-07-15T12:00:00.000Z",
  room_id: "55555555-5555-4555-8555-555555555555",
  room_code: "RANK26",
  topic: "live-rivalry:55555555-5555-4555-8555-555555555555",
  status: "waiting",
  state_version: 2,
  mode: "nhl-circuit",
  current_round: 0,
  situations,
  created_at: "2026-07-15T12:00:00.000Z",
  started_at: null,
  completed_at: null,
  expires_at: "2026-07-15T12:15:00.000Z",
  rematch_of: null,
  me: {
    user_id: "11111111-1111-4111-8111-111111111111",
    role: "host",
    display_label: "Alex",
    lineup_id: lineup.id,
    lineup_name: lineup.name,
    lineup,
    ready: false,
    locked: false,
  },
  opponent: null,
  rounds: [],
  result: null,
  head_to_head: { matches: 0, player_wins: 0, opponent_wins: 0 },
  rewards: { credits: 0, season_xp: 0, cards: 0, objectives: 0 },
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
      abandon_match: { status: "abandoned" },
    });
    const slots = lineup.slots;

    await expect(repository.saveLineup({ lineupId: "lineup-1", name: "Cloud Six", mode: "nhl-circuit", slots })).resolves.toMatchObject({ status: "saved", lineup: { id: "lineup-1" } });
    await expect(repository.activateLineup("lineup-1")).resolves.toMatchObject({ status: "activated", lineup: { isActive: true } });
    await expect(repository.claimRivalryReward({ clientRequestId: "reward-request", cardId: "reward-card" })).resolves.toMatchObject({ status: "claimed", quantity: 1 });
    await expect(repository.startMatch({ clientMatchId: "match-1", mode: "nhl-circuit", difficulty: "rookie" })).resolves.toMatchObject({ seed: "seed-1", opponentId: "rookie-rival", lineup: { id: "lineup-1", slots: lineup.slots }, rounds: [{ roundIndex: 0, status: "already-played" }] });
    await expect(repository.playMatchRound({ clientMatchId: "match-1", roundIndex: 0, playerCardId: "lw", clientRequestId: "round-request" })).resolves.toMatchObject({ winner: "player", tieBreaker: "category", transcript: { player: { value: 90 } } });
    await expect(repository.settleMatch({ clientMatchId: "match-1" })).resolves.toMatchObject({ status: "settled", rewardCredits: 345 });
    await expect(repository.abandonMatch({ clientMatchId: "match-1" })).resolves.toEqual({ status: "abandoned" });

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
    expect(rpc).toHaveBeenCalledWith("abandon_match", { client_match_id: "match-1" });
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

  it("maps the complete Ghost Rivalry contract without client-authored scores", async () => {
    const challengeTicket = {
      status: "started",
      client_match_id: "ghost-match-1",
      seed: "ghost-seed-1",
      opponent_id: "challenge:challenge-1",
      opponent: { id: "challenge:challenge-1", name: "Alex's Ghost", mode: "nhl-circuit", slots: lineup.slots },
      lineup: { id: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots },
      situations,
      rounds: [],
      mode: "nhl-circuit",
      difficulty: "rookie",
    };
    const { repository, rpc } = repositoryWithRpc({
      get_public_rivalry_challenge: {
        status: "active", slug: "0123456789abcdef0123456789abcdef", creator_label: "Alex",
        mode: "nhl-circuit", difficulty: "rookie", challenge_strength: 84,
        created_at: "2026-07-15T00:00:00.000Z", expires_at: "2026-08-14T00:00:00.000Z",
      },
      create_rivalry_challenge: {
        status: "created", challenge_id: "challenge-1", slug: "0123456789abcdef0123456789abcdef",
        expires_at: "2026-08-14T00:00:00.000Z", challenge_status: "active",
      },
      start_rivalry_challenge: challengeTicket,
      play_rivalry_challenge_round: { ...roundPayload, client_match_id: "ghost-match-1" },
      settle_rivalry_challenge: {
        status: "settled", challenge_id: "challenge-1", attempt_id: "attempt-1",
        outcome: "win", player_wins: 3, ghost_wins: 2,
      },
      abandon_rivalry_challenge: { status: "already-abandoned" },
      list_rivalry_challenges: { created: [{
        slug: "0123456789abcdef0123456789abcdef", creator_label: "Alex", mode: "nhl-circuit",
        difficulty: "rookie", challenge_strength: 84, status: "active",
        created_at: "2026-07-15T00:00:00.000Z", expires_at: "2026-08-14T00:00:00.000Z",
        attempts: 2, completed: 1, ghost_defenses: 1, challenger_wins: 0,
      }] },
      revoke_rivalry_challenge: { status: "revoked", slug: "0123456789abcdef0123456789abcdef" },
    });

    await expect(repository.loadPublicRivalryChallenge("0123456789abcdef0123456789abcdef")).resolves.toMatchObject({ creatorLabel: "Alex", challengeStrength: 84 });
    await expect(repository.createRivalryChallenge({ clientRequestId: "create-1", sourceClientMatchId: "source-1", sourceKind: "ai-match" })).resolves.toMatchObject({ status: "created", challengeStatus: "active" });
    await expect(repository.startRivalryChallenge({ slug: "0123456789abcdef0123456789abcdef", clientMatchId: "ghost-match-1", lineupId: "lineup-1" })).resolves.toMatchObject({ opponentId: "challenge:challenge-1", rounds: [] });
    await expect(repository.playRivalryChallengeRound({ clientMatchId: "ghost-match-1", roundIndex: 0, playerCardId: "lw", clientRequestId: "ghost-round-1" })).resolves.toMatchObject({ winner: "player", playerScore: 90 });
    await expect(repository.settleRivalryChallenge({ clientMatchId: "ghost-match-1" })).resolves.toMatchObject({ outcome: "win", playerWins: 3, ghostWins: 2 });
    await expect(repository.abandonRivalryChallenge({ clientMatchId: "ghost-match-1" })).resolves.toEqual({ status: "already-abandoned" });
    await expect(repository.listRivalryChallenges()).resolves.toEqual([expect.objectContaining({ attempts: 2, ghostDefenses: 1 })]);
    await expect(repository.revokeRivalryChallenge("0123456789abcdef0123456789abcdef")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("create_rivalry_challenge", { client_request_id: "create-1", source_client_match_id: "source-1", source_kind: "ai-match" });
    expect(rpc).toHaveBeenCalledWith("start_rivalry_challenge", { challenge_slug: "0123456789abcdef0123456789abcdef", client_match_id: "ghost-match-1", lineup_id: "lineup-1" });
    expect(rpc).toHaveBeenCalledWith("settle_rivalry_challenge", { client_match_id: "ghost-match-1" });
    expect(rpc).toHaveBeenCalledWith("abandon_rivalry_challenge", { client_match_id: "ghost-match-1" });
  });

  it("maps Season Locker and Rivalry Arena through server-only RPC inputs", async () => {
    const rewards = Array.from({ length: 30 }, (_, index) => ({
      tier: index + 1,
      xp_required: (index + 1) * 100,
      reward_type: index === 14 ? "card" : "credits",
      label: `Tier ${index + 1}`,
      description: "Guaranteed reward.",
      amount: index === 14 ? null : 100,
      card_id: index === 14 ? "nhl-connor-mcdavid-rivalry-2026" : null,
      cosmetic_slug: null,
      metadata: {},
      unlocked: index < 2,
      claimed: false,
      claimed_at: null,
    }));
    const arenaTicket = {
      status: "started",
      client_match_id: "arena-1",
      seed: "arena-seed",
      opponent_id: "22222222-2222-4222-8222-222222222222",
      opponent: { id: "22222222-2222-4222-8222-222222222222", name: "Morgan's Six", mode: lineup.mode, slots: lineup.slots },
      lineup: { id: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots },
      situations,
      rounds: [],
      mode: lineup.mode,
      difficulty: "pro",
    };
    const { repository, rpc } = repositoryWithRpc({
      get_season_locker: {
        status: "active",
        server_time: "2026-07-15T12:00:00.000Z",
        season: { id: "season-zero-2026", name: "Season Zero", description: "Free.", starts_at: "2026-07-15T00:00:00.000Z", ends_at: "2026-08-12T00:00:00.000Z" },
        xp: 240,
        faceoff_matches: 1,
        arena_matches: 1,
        rewards,
      },
      claim_season_reward: { status: "claimed", season_id: "season-zero-2026", tier: 1, reward: rewards[0], claimed_at: "2026-07-15T12:01:00.000Z", credits: 1100 },
      start_arena_match: arenaTicket,
      play_arena_match_round: { ...roundPayload, client_match_id: "arena-1" },
      settle_arena_match: { status: "settled", match_id: "arena-db-1", reward_credits: 420, credits: 1520, completed_matches: 2 },
      abandon_arena_match: { status: "already-settled" },
    });

    const locker = await repository.loadSeasonLocker();
    expect(locker).toMatchObject({ status: "active", xp: 240 });
    expect(locker.rewards).toHaveLength(30);
    expect(locker.rewards[0]).toMatchObject({ tier: 1, unlocked: true });
    expect(locker.rewards[14]).toMatchObject({ tier: 15, rewardType: "card" });
    await expect(repository.claimSeasonReward({ seasonId: "season-zero-2026", tier: 1, clientRequestId: "claim-1" })).resolves.toMatchObject({ status: "claimed", tier: 1 });
    await expect(repository.startArenaMatch({ clientMatchId: "arena-1", mode: "nhl-circuit" })).resolves.toMatchObject({ opponentId: "22222222-2222-4222-8222-222222222222", difficulty: "pro" });
    await expect(repository.playArenaMatchRound({ clientMatchId: "arena-1", roundIndex: 0, playerCardId: "lw", clientRequestId: "arena-round-1" })).resolves.toMatchObject({ winner: "player" });
    await expect(repository.settleArenaMatch({ clientMatchId: "arena-1" })).resolves.toMatchObject({ rewardCredits: 420 });
    await expect(repository.abandonArenaMatch({ clientMatchId: "arena-1" })).resolves.toEqual({ status: "already-settled" });
    expect(rpc).toHaveBeenCalledWith("start_arena_match", { client_match_id: "arena-1", mode: "nhl-circuit" });
    expect(rpc).toHaveBeenCalledWith("play_arena_match_round", { client_match_id: "arena-1", round_index: 0, player_card_id: "lw", client_request_id: "arena-round-1" });
    expect(rpc).toHaveBeenCalledWith("abandon_arena_match", { client_match_id: "arena-1" });
  });

  it("maps Live rooms, sends only immutable action inputs, and rejects any non-zero reward", async () => {
    const { repository, rpc } = repositoryWithRpc({
      get_live_rivalry_room: liveRoomPayload,
      create_live_rivalry_room: liveRoomPayload,
      join_live_rivalry_room: { ...liveRoomPayload, me: { ...liveRoomPayload.me, role: "guest" } },
      set_live_rivalry_ready: { ...liveRoomPayload, me: { ...liveRoomPayload.me, ready: true } },
      lock_live_rivalry_choice: {
        ...liveRoomPayload,
        status: "active",
        started_at: "2026-07-15T12:02:00.000Z",
        me: { ...liveRoomPayload.me, ready: true, locked: true },
        opponent: {
          user_id: "22222222-2222-4222-8222-222222222222",
          role: "guest",
          display_label: "Morgan",
          lineup_id: "lineup-2",
          lineup_name: "Morgan's Six",
          ready: true,
          online: true,
          locked: false,
        },
      },
    });

    await expect(repository.loadLiveRivalryRoom()).resolves.toMatchObject({ roomCode: "RANK26", opponent: null, rewards: { credits: 0, seasonXp: 0 } });
    await repository.createLiveRivalryRoom({ clientRequestId: "create-live-1", mode: "nhl-circuit", lineupId: lineup.id });
    await repository.joinLiveRivalryRoom({ roomCode: "rank26", clientRequestId: "join-live-1", lineupId: lineup.id });
    await repository.setLiveRivalryReady(liveRoomPayload.room_id, true, "ready-1");
    await repository.lockLiveRivalryChoice({ roomId: liveRoomPayload.room_id, roundIndex: 0, cardId: "lw", clientRequestId: "lock-1" });

    expect(rpc).toHaveBeenCalledWith("join_live_rivalry_room", { room_code: "RANK26", client_request_id: "join-live-1", lineup_id: lineup.id });
    expect(rpc).toHaveBeenCalledWith("lock_live_rivalry_choice", { room_id: liveRoomPayload.room_id, round_index: 0, card_id: "lw", client_request_id: "lock-1" });

    const unsafe = repositoryWithRpc({
      get_live_rivalry_room: { ...liveRoomPayload, rewards: { ...liveRoomPayload.rewards, season_xp: 1 } },
    }).repository;
    await expect(unsafe.loadLiveRivalryRoom()).rejects.toThrow(/zero-reward contract/i);
  });
});
