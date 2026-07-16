import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { calculateCategoryValue, createBattle, getBattleView, getEligibleCards, revealRound, selectCard, type BattleState } from "../../domain/battle";
import { gameCatalog, starterLineups } from "../../data/generated/gameCatalog";
import { BroadcastSting } from "./BroadcastSting";
import { MatchExperienceV2, type MatchExperienceV2Props } from "./MatchExperienceV2";

function battle(): BattleState {
  const lineups = starterLineups.filter((lineup) => lineup.mode === "nhl-circuit");
  return createBattle({ seed: "v2-component", mode: "nhl-circuit", difficulty: "rookie", catalog: gameCatalog, playerLineup: lineups[0], opponentLineup: lineups[1] });
}

function completedLoss(): BattleState {
  let state = battle();
  while (state.phase !== "complete") {
    const situation = state.situations[state.roundIndex];
    const player = [...getEligibleCards(state, "player")].sort((left, right) => calculateCategoryValue(left.card, situation) - calculateCategoryValue(right.card, situation))[0];
    const opponent = [...getEligibleCards(state, "opponent")].sort((left, right) => calculateCategoryValue(right.card, situation) - calculateCategoryValue(left.card, situation))[0];
    state = selectCard(state, "opponent", opponent.card.id);
    state = selectCard(state, "player", player.card.id);
    state = revealRound(state);
  }
  return state;
}

function props(state: BattleState, overrides: Partial<MatchExperienceV2Props> = {}): MatchExperienceV2Props {
  return {
    battle: getBattleView(state, "player"),
    eligibleCardIds: getEligibleCards(state, "player").map(({ card }) => card.id),
    rewardGranted: false,
    settling: false,
    roundPlaying: false,
    reviewingRound: false,
    restored: true,
    onSelect: vi.fn(),
    onReveal: vi.fn(),
    onContinue: vi.fn(),
    onRetrySettlement: vi.fn(),
    onPlayAgain: vi.fn(),
    onFinish: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

describe("Match Experience V2", () => {
  it("keeps the opponent card identity, value, and accessibility content out of the DOM before reveal", () => {
    const state = battle();
    const opponent = state.lineups.opponent.cards[0];
    render(<MatchExperienceV2 {...props(state)} />);
    expect(screen.getByLabelText("Rival card concealed")).toBeInTheDocument();
    expect(screen.queryByText(opponent.player.name)).not.toBeInTheDocument();
    expect(document.querySelector(`[data-card-image='${opponent.card.id}']`)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(opponent.card.id);
  });

  it("shows both exact values after an authoritative result and focuses the single continue action", () => {
    let state = battle();
    state = selectCard(state, "opponent", getEligibleCards(state, "opponent")[0].card.id);
    state = selectCard(state, "player", getEligibleCards(state, "player")[0].card.id);
    state = revealRound(state);
    const result = state.results[0];
    render(<MatchExperienceV2 {...props(state, { reviewingRound: true })} />);
    expect(screen.getByRole("region", { name: "Round 1 result" })).toBeInTheDocument();
    expect(screen.getByLabelText(`${result.playerScore.value} versus ${result.opponentScore.value}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });

  it("locks selection to one commit and provides a no-asset Rive fallback", () => {
    const state = battle();
    const callbacks = props(state);
    render(<MatchExperienceV2 {...callbacks} />);
    const eligible = screen.getAllByRole("button").find((button) => button.getAttribute("aria-label")?.includes("Eligible"))!;
    fireEvent.click(eligible);
    fireEvent.click(eligible);
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
    const { container } = render(<BroadcastSting reducedMotion={false} />);
    expect(container.querySelector("[data-rive-fallback='true']")).toBeInTheDocument();
  });

  it("keeps a no-eligible-card round understandable without enabling a card", () => {
    const state = battle();
    render(<MatchExperienceV2 {...props(state, { eligibleCardIds: [] })} />);
    const hand = screen.getByRole("region", { name: "Player hand" });
    expect(hand.querySelectorAll("button")).toHaveLength(6);
    expect([...hand.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    expect(screen.getByText("0 cards")).toBeInTheDocument();
  });

  it("confirms an exit before abandoning the active match", () => {
    const callbacks = props(battle());
    render(<MatchExperienceV2 {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Exit match" }));
    expect(screen.getByRole("dialog", { name: "Abandon match?" })).toBeInTheDocument();
    expect(screen.getByText("Your progress in this match will be lost.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue match" }));
    expect(screen.queryByRole("dialog", { name: "Abandon match?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit match" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon match" }));
    expect(callbacks.onExit).toHaveBeenCalledTimes(1);
  });

  it("renders the dedicated authoritative match-loss conclusion", () => {
    const state = completedLoss();
    expect(state.winner).toBe("opponent");
    render(<MatchExperienceV2 {...props(state, { rewardGranted: true, progressionMessage: "Match settled on the server." })} />);
    expect(screen.getByRole("heading", { name: "Rival takes the night" })).toBeInTheDocument();
    expect(screen.getByLabelText(`Final score ${state.roundWins.player} to ${state.roundWins.opponent}`)).toBeInTheDocument();
  });
});
