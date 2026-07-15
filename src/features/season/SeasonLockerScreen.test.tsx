import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { gameCatalog } from "../../data/generated/gameCatalog";
import type { SeasonLockerState } from "../../infrastructure/supabase";
import { SeasonLockerScreen } from "./SeasonLockerScreen";

function locker(): SeasonLockerState {
  return {
    status: "active",
    serverTime: "2026-07-15T12:00:00.000Z",
    season: {
      id: "season-zero-2026",
      name: "Season Zero: First Shift",
      description: "Every reward is visible and guaranteed.",
      startsAt: "2026-07-15T00:00:00.000Z",
      endsAt: "2026-08-12T00:00:00.000Z",
    },
    xp: 240,
    faceoffMatches: 1,
    arenaMatches: 1,
    rewards: Array.from({ length: 30 }, (_, index) => ({
      tier: index + 1,
      xpRequired: (index + 1) * 100,
      rewardType: "credits" as const,
      label: `Tier ${index + 1} Reward`,
      description: "Guaranteed reward.",
      amount: 100,
      cardId: null,
      cosmeticSlug: null,
      metadata: {},
      unlocked: index < 2,
      claimed: false,
      claimedAt: null,
    })),
  };
}

describe("SeasonLockerScreen", () => {
  it("renders the complete free reward path and claims through one idempotent request", async () => {
    const onClaim = vi.fn().mockResolvedValue({
      status: "claimed",
      seasonId: "season-zero-2026",
      tier: 1,
      reward: {},
      claimedAt: "2026-07-15T12:01:00.000Z",
      credits: 1100,
    });
    render(<SeasonLockerScreen locker={locker()} catalog={gameCatalog} onClaim={onClaim} />);

    expect(screen.getByText("No paid track")).toBeVisible();
    expect(screen.getByText(/Faceoff and Rivalry Arena/i)).toBeVisible();
    expect(screen.getByRole("list").querySelectorAll("li")).toHaveLength(30);
    const tierOne = screen.getByText("Tier 1 Reward").closest("li");
    if (!tierOne) throw new Error("Missing Season tier one.");
    fireEvent.click(within(tierOne).getByRole("button", { name: "Claim reward" }));

    await waitFor(() => expect(onClaim).toHaveBeenCalledOnce());
    expect(onClaim).toHaveBeenCalledWith("season-zero-2026", 1, expect.any(String));
    expect(await screen.findByRole("status")).toHaveTextContent("Tier 1 secured");
    expect(within(screen.getByText("Tier 3 Reward").closest("li")!).getByRole("button")).toBeDisabled();
  });
});
