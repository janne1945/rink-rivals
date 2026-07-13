// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lineup } from "../../../domain/lineups";
import { HomeScreen } from "../../home/HomeScreen";
import { PlayScreen } from "../../play/PlayScreen";
import { ObjectiveScreen } from "../ObjectiveScreen";
import type { GoalsSummaryViewModel, ObjectiveViewModel, RivalryRoadStepViewModel } from "../viewModels";

const dailyObjectives: readonly ObjectiveViewModel[] = [
  { id: "daily-match-complete", title: "Finish a faceoff", description: "Complete one match.", progress: 1, target: 1, rewardCredits: 75, completed: true },
  { id: "daily-match-win", title: "Light the lamp", description: "Win one match.", progress: 0, target: 1, rewardCredits: 100, completed: false },
  { id: "daily-spotlight", title: "NHL spotlight", description: "Complete an NHL Circuit match.", progress: 0, target: 1, rewardCredits: 100, completed: false },
];

const weeklyObjective: ObjectiveViewModel = {
  id: "weekly-circuit-tour",
  title: "Circuit tour",
  description: "Complete five matches and visit every circuit.",
  progress: 2,
  target: 5,
  rewardCredits: 350,
  completed: false,
};

const rivalrySteps: readonly RivalryRoadStepViewModel[] = [
  { id: "nhl-circuit-complete", title: "NHL opening shift", description: "Complete an NHL Circuit match.", rewardLabel: "+150 Credits", status: "completed" },
  { id: "pwhl-circuit-complete", title: "PWHL answer", description: "Complete a PWHL Circuit match.", rewardLabel: "+150 Credits", status: "active" },
  { id: "open-ice-pro-win", title: "Open Ice finale", description: "Win Open Ice on Pro or Elite.", rewardLabel: "Featured card choice", status: "locked" },
];

const goals: GoalsSummaryViewModel = {
  dailyObjectives,
  weeklyObjective,
  nextRivalryStep: rivalrySteps[1],
};

const openIceLineup: Lineup = {
  id: "open-six",
  name: "Open Six",
  mode: "open-ice",
  slots: { LW: "lw", C: "c", RW: "rw", LD: "ld", RD: "rd", G: "g" },
};

afterEach(cleanup);

describe("progression UI", () => {
  it("shows the full goals hub with ordered Rivalry Road state", () => {
    render(
      <MemoryRouter>
        <ObjectiveScreen
          dailyObjectives={dailyObjectives}
          dailyPeriodLabel="Resets at local midnight"
          weeklyObjective={weeklyObjective}
          weeklyPeriodLabel="Monday through Sunday"
          rivalrySteps={rivalrySteps}
          onChooseRivalryCard={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Goals hub" })).toBeVisible();
    expect(screen.getByText("Resets at local midnight")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: /finish a faceoff: 1 of 1/i })).toHaveValue(1);
    expect(screen.getByRole("heading", { name: "PWHL answer" })).toBeVisible();
  });

  it("opens the full goals route from the compact home summary", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomeScreen credits={1_200} uniqueCards={18} collectionScore={1_499} completedMatches={2} goals={goals} />} />
          <Route path="/objectives" element={<h1>Full goals route</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Light the lamp")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "View all goals" }));
    expect(screen.getByRole("heading", { name: "Full goals route" })).toBeVisible();
  });

  it("keeps locked difficulties focusable and starts with the selected unlocked tier", () => {
    const onDifficultyChange = vi.fn();
    const onStart = vi.fn();
    render(
      <PlayScreen
        lineups={[openIceLineup]}
        activeLineupIds={{ "open-ice": openIceLineup.id }}
        collectionScore={1_500}
        preferredDifficulty="rookie"
        onDifficultyChange={onDifficultyChange}
        onStart={onStart}
      />,
    );

    const elite = screen.getByRole("button", { name: /elite/i });
    expect(elite).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(elite);
    expect(onDifficultyChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /pro/i }));
    expect(onDifficultyChange).toHaveBeenCalledWith("pro");
    expect(screen.getByText(/win \+180 · draw \+120 · loss \+80 credits/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Start match" }));
    expect(onStart).toHaveBeenCalledWith("open-ice", "pro");
  });
});
