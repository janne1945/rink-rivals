import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("App environment fallback", () => {
  it("renders a visible configuration error instead of a blank screen", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { App } = await import("./App");
    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent("Rink Rivals could not start");
    expect(screen.getByRole("alert")).toHaveTextContent("server configuration is missing");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
