import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type {
  AccountLineup,
  AccountProfile,
  AccountRepository,
  AuthService,
  AuthStateListener,
} from "../../../infrastructure/supabase";
import { AccountGate } from "../AccountGate";

const session = {
  access_token: "test-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-1" },
} as Session;

const readyProfile: AccountProfile = {
  id: "user-1",
  displayName: "Alex",
  credits: 1000,
  selectedTeamId: "edmonton-oilers",
  starterClaimedAt: "2026-07-13T00:00:00.000Z",
  onboardingCompleted: true,
};

const onboardingProfile: AccountProfile = {
  ...readyProfile,
  credits: 0,
  selectedTeamId: null,
  starterClaimedAt: null,
  onboardingCompleted: false,
};

const lineup: AccountLineup = {
  id: "lineup-1",
  name: "Edmonton Oilers Starter",
  mode: "nhl-circuit",
  isActive: true,
  slots: {
    LW: "nhl-brady-tkachuk-base",
    C: "nhl-connor-mcdavid-base",
    RW: "nhl-mikko-rantanen-base",
    LD: "nhl-rasmus-dahlin-base",
    RD: "nhl-evan-bouchard-base",
    G: "nhl-igor-shesterkin-base",
  },
};

function createAuth(restoredSession: Session | null = null) {
  let listener: AuthStateListener | undefined;
  const auth: AuthService = {
    restoreSession: vi.fn().mockResolvedValue(restoredSession),
    subscribe: vi.fn((nextListener: AuthStateListener) => {
      listener = nextListener;
      return vi.fn();
    }),
    register: vi.fn().mockResolvedValue(null),
    login: vi.fn().mockResolvedValue(session),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  return {
    auth,
    emit(event: AuthChangeEvent, nextSession: Session | null) {
      listener?.(event, nextSession);
    },
  };
}

function createRepository(profile: AccountProfile = readyProfile): AccountRepository {
  return {
    loadProfile: vi.fn().mockResolvedValue(profile),
    loadOwnCards: vi.fn().mockResolvedValue([]),
    loadLineup: vi.fn().mockResolvedValue(lineup),
    claimStarterTeam: vi.fn().mockResolvedValue(lineup),
  };
}

function renderGate(auth: AuthService, repository: AccountRepository) {
  render(
    <AccountGate auth={auth} repository={repository}>
      {(account) => <main><h1>Main menu</h1><span>{account.profile.credits} Credits</span></main>}
    </AccountGate>,
  );
}

describe("AccountGate", () => {
  it("registers with email, password, and display name", async () => {
    const { auth } = createAuth();
    renderGate(auth, createRepository());
    await screen.findByRole("heading", { name: "Welcome back" });
    fireEvent.click(screen.getByRole("tab", { name: "Register" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith({ displayName: "Alex", email: "alex@example.com", password: "password123" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
  });

  it("logs in and loads the account", async () => {
    const { auth } = createAuth();
    const repository = createRepository();
    renderGate(auth, repository);
    await screen.findByRole("heading", { name: "Welcome back" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Main menu" })).toBeVisible();
    expect(auth.login).toHaveBeenCalledWith({ email: "alex@example.com", password: "password123" });
    expect(repository.loadProfile).toHaveBeenCalled();
  });

  it("restores an existing session on startup", async () => {
    const { auth } = createAuth(session);
    renderGate(auth, createRepository());
    expect(await screen.findByRole("heading", { name: "Main menu" })).toBeVisible();
    expect(auth.restoreSession).toHaveBeenCalledOnce();
  });

  it("claims Edmonton and reloads profile, cards, and lineup", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository(onboardingProfile);
    vi.mocked(repository.loadProfile)
      .mockResolvedValueOnce(onboardingProfile)
      .mockResolvedValueOnce(readyProfile);
    renderGate(auth, repository);
    const claimButton = await screen.findByRole("button", { name: "Choose Edmonton Oilers" });
    fireEvent.click(claimButton);
    expect(await screen.findByRole("heading", { name: "Main menu" })).toBeVisible();
    expect(repository.claimStarterTeam).toHaveBeenCalledWith("edmonton-oilers");
    expect(repository.loadProfile).toHaveBeenCalledTimes(2);
    expect(repository.loadOwnCards).toHaveBeenCalledOnce();
    expect(repository.loadLineup).toHaveBeenCalledOnce();
  });

  it("shows the database error when a duplicate starter claim is rejected", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository(onboardingProfile);
    vi.mocked(repository.claimStarterTeam).mockRejectedValue(new Error("Starter team has already been claimed."));
    renderGate(auth, repository);
    fireEvent.click(await screen.findByRole("button", { name: "Choose Edmonton Oilers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Starter team has already been claimed.");
    expect(screen.getByRole("button", { name: "Choose Edmonton Oilers" })).toBeEnabled();
  });

  it("reacts to auth-state logout events", async () => {
    const { auth, emit } = createAuth(session);
    renderGate(auth, createRepository());
    await screen.findByRole("heading", { name: "Main menu" });
    emit("SIGNED_OUT", null);
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  it("shows an account-loading error instead of falling back to Dexie", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository();
    vi.mocked(repository.loadProfile).mockRejectedValue(new Error("Profile service unavailable"));
    renderGate(auth, repository);
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile service unavailable");
    expect(screen.queryByRole("heading", { name: "Main menu" })).not.toBeInTheDocument();
  });
});
