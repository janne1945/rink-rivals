import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StarterTeamScreen } from "./StarterTeamScreen";

describe("StarterTeamScreen", () => {
  it("clears the previous league query before selecting a visible team", () => {
    render(
      <StarterTeamScreen
        busy={false}
        errorMessage=""
        displayName="Alex"
        onClaim={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search NHL teams" }), {
      target: { value: "Oilers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PWHL" }));

    expect(screen.getByRole("searchbox", { name: "Search PWHL teams" })).toHaveValue("");
    expect(within(screen.getByRole("list", { name: "PWHL teams" })).getAllByRole("button").length)
      .toBeGreaterThan(0);
    expect(screen.queryByText(/No PWHL teams match/)).not.toBeInTheDocument();
  });
});
