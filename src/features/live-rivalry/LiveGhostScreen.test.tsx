import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { gameCatalog } from "../../data/generated/gameCatalog";
import type { LineupSlot } from "../../domain/lineups";
import type { AccountLineup, LiveRivalryRoomState } from "../../infrastructure/supabase";
import { LiveGhostScreen } from "./LiveGhostScreen";

const starter = gameCatalog.starterSquads[0]!;
const starterSlots = starter.lineup as Readonly<Record<LineupSlot, string>>;
const lineup: AccountLineup = {
  id: "lineup-1",
  name: "Starter Six",
  mode: "nhl-circuit",
  isActive: true,
  slots: starterSlots,
};
const situations = [
  { id: "skater-speed", name: "Speed", description: "Higher Speed wins.", role: "skater" as const, eligibleSlots: ["LW", "C", "RW"] as const, attribute: "speed" as const },
  { id: "skater-shooting", name: "Shooting", description: "Higher Shooting wins.", role: "skater" as const, eligibleSlots: ["LW", "C", "RW"] as const, attribute: "shooting" as const },
  { id: "skater-defense", name: "Defense", description: "Higher Defense wins.", role: "skater" as const, eligibleSlots: ["LD", "RD"] as const, attribute: "defense" as const },
  { id: "skater-clutch", name: "Clutch", description: "Higher Clutch wins.", role: "skater" as const, eligibleSlots: ["LW", "C", "RW", "LD", "RD"] as const, attribute: "clutch" as const },
  { id: "goalie-reflexes", name: "Reflexes", description: "Higher Reflexes wins.", role: "goalie" as const, eligibleSlots: ["G"] as const, attribute: "reflexes" as const },
];

function activeRoom(locked = false): LiveRivalryRoomState {
  return {
    serverTime: "2026-07-15T12:02:00.000Z",
    roomId: "55555555-5555-4555-8555-555555555555",
    roomCode: "RANK26",
    topic: "live-rivalry:55555555-5555-4555-8555-555555555555",
    status: "active",
    stateVersion: locked ? 4 : 3,
    mode: "nhl-circuit",
    currentRound: 0,
    situations,
    createdAt: "2026-07-15T12:00:00.000Z",
    startedAt: "2026-07-15T12:02:00.000Z",
    completedAt: null,
    expiresAt: "2026-07-16T12:02:00.000Z",
    rematchOf: null,
    me: {
      userId: "11111111-1111-4111-8111-111111111111",
      role: "guest",
      displayLabel: "Alex",
      lineupId: lineup.id,
      lineupName: lineup.name,
      lineup: { id: lineup.id, name: lineup.name, mode: lineup.mode, slots: starterSlots },
      ready: true,
      locked,
    },
    opponent: {
      userId: "22222222-2222-4222-8222-222222222222",
      role: "host",
      displayLabel: "Morgan",
      lineupId: "lineup-2",
      lineupName: "Morgan's Six",
      ready: true,
      online: true,
      locked: false,
    },
    rounds: [],
    result: null,
    headToHead: { matches: 0, playerWins: 0, opponentWins: 0 },
    rewards: { credits: 0, seasonXp: 0, cards: 0, objectives: 0 },
  };
}

describe("LiveGhostScreen", () => {
  it("locks one eligible card, freezes the selection, and exposes no opponent card", async () => {
    const lockLiveRivalryChoice = vi.fn().mockResolvedValue(activeRoom(true));
    const actions: ComponentProps<typeof LiveGhostScreen>["actions"] = {
      loadLiveRivalryRoom: vi.fn().mockResolvedValue(activeRoom()),
      createLiveRivalryRoom: vi.fn(),
      joinLiveRivalryRoom: vi.fn(),
      setLiveRivalryReady: vi.fn(),
      lockLiveRivalryChoice,
      leaveLiveRivalryRoom: vi.fn(),
      createLiveRivalryRematch: vi.fn(),
      subscribeToLiveRivalryRoom: vi.fn().mockReturnValue(vi.fn()),
    };
    render(<LiveGhostScreen lineups={[lineup]} catalog={gameCatalog} actions={actions} />);

    expect(await screen.findByRole("heading", { name: "Round 1 of 5" })).toBeVisible();
    const choices = screen.getByText("Your eligible cards").closest("section")?.querySelectorAll("[data-live-hand] button");
    expect(choices?.length).toBeGreaterThan(0);
    fireEvent.click(choices![0]!);
    fireEvent.click(screen.getByRole("button", { name: "Lock this card" }));

    await waitFor(() => expect(lockLiveRivalryChoice).toHaveBeenCalledOnce());
    expect(lockLiveRivalryChoice).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "55555555-5555-4555-8555-555555555555",
      roundIndex: 0,
      clientRequestId: expect.any(String),
    }));
    expect(await screen.findByRole("heading", { name: "Selection sealed" })).toBeVisible();
    expect(screen.getByText(/cannot be changed/i)).toBeVisible();
    expect(screen.queryByText("Last reveal")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[aria-label*='Morgan']")).toHaveLength(0);
  });
});
