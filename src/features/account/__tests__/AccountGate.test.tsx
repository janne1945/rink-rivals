import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type {
  AccountLineup,
  AccountProfile,
  AccountRepository,
  AuthService,
  AuthStateListener,
} from "../../../infrastructure/supabase";
import { gameCatalog } from "../../../data/generated/gameCatalog";
import { AccountGate } from "../AccountGate";

const edmontonTeam = gameCatalog.teams.find((team) => team.name === "Edmonton Oilers")!;
const edmontonStarter = gameCatalog.starterSquads.find((starter) => starter.teamId === edmontonTeam.id)!;

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
  selectedTeamId: edmontonTeam.id,
  starterClaimedAt: "2026-07-13T00:00:00.000Z",
  onboardingCompleted: true,
  completedMatches: 0,
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
  slots: edmontonStarter.lineup,
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
    loadLineups: vi.fn().mockResolvedValue([lineup]),
    loadLineup: vi.fn().mockResolvedValue(lineup),
    loadObjectiveProgress: vi.fn().mockResolvedValue([]),
    loadRivalryRoadProgress: vi.fn().mockResolvedValue({
      currentStepIndex: 0, completedStepIds: [], status: "in-progress", selectedCardId: null,
    }),
    claimStarterTeam: vi.fn().mockResolvedValue(lineup),
    loadMarketState: vi.fn().mockResolvedValue({
      serverTime: "2026-07-13T00:00:00.000Z",
      currentEvent: null,
      offers: [],
    }),
    loadSeasonLocker: vi.fn().mockResolvedValue({
      status: "unavailable", serverTime: "2026-07-13T00:00:00.000Z", season: null,
      xp: 0, faceoffMatches: 0, arenaMatches: 0, rewards: [],
    }),
    purchaseCard: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    saveLineup: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    activateLineup: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    claimRivalryReward: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    startMatch: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    playMatchRound: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    settleMatch: vi.fn().mockResolvedValue({
      status: "settled", matchId: "match-db-1", rewardCredits: 345, credits: 1345, completedMatches: 1,
    }),
    abandonMatch: vi.fn().mockResolvedValue({ status: "abandoned" }),
    claimSeasonReward: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    startArenaMatch: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    playArenaMatchRound: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    settleArenaMatch: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    abandonArenaMatch: vi.fn().mockResolvedValue({ status: "abandoned" }),
    loadLiveRivalryRoom: vi.fn().mockResolvedValue(null),
    createLiveRivalryRoom: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    joinLiveRivalryRoom: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    setLiveRivalryReady: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    lockLiveRivalryChoice: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    leaveLiveRivalryRoom: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    createLiveRivalryRematch: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    subscribeToLiveRivalryRoom: vi.fn().mockReturnValue(vi.fn()),
    loadPublicRivalryChallenge: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    createRivalryChallenge: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    startRivalryChallenge: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    playRivalryChallengeRound: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    settleRivalryChallenge: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    abandonRivalryChallenge: vi.fn().mockResolvedValue({ status: "abandoned" }),
    revokeRivalryChallenge: vi.fn().mockRejectedValue(new Error("Not used in this test.")),
    listRivalryChallenges: vi.fn().mockResolvedValue([]),
  };
}

function renderGate(auth: AuthService, repository: AccountRepository) {
  render(
    <AccountGate auth={auth} repository={repository}>
      {(account) => <main><h1>Main menu</h1><span>{account.profile.credits} Credits</span></main>}
    </AccountGate>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function selectEdmontonStarter(): void {
  fireEvent.change(screen.getByLabelText("Search NHL teams"), { target: { value: "Edmonton" } });
  fireEvent.click(within(screen.getByRole("list", { name: "NHL teams" })).getByRole("button", { name: /Edmonton Oilers/i }));
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
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Alex", email: "alex@example.com", password: "password123", redirectTo: "http://localhost:3000/" })));
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

  it("settles through the repository and refreshes all server-owned account data", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository();
    render(
      <AccountGate auth={auth} repository={repository}>
        {(_account, actions) => <button onClick={() => void actions.settleMatch({ clientMatchId: "client-1" })}>Settle</button>}
      </AccountGate>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Settle" }));
    await waitFor(() => expect(repository.settleMatch).toHaveBeenCalledOnce());
    await waitFor(() => expect(repository.loadObjectiveProgress).toHaveBeenCalledTimes(2));
    expect(repository.loadRivalryRoadProgress).toHaveBeenCalledTimes(2);
  });

  it("claims the selected team id and reloads profile, cards, and lineup", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository(onboardingProfile);
    vi.mocked(repository.loadProfile)
      .mockResolvedValueOnce(onboardingProfile)
      .mockResolvedValueOnce(readyProfile);
    renderGate(auth, repository);
    await screen.findByRole("heading", { name: "Choose your club" });
    selectEdmontonStarter();
    const claimButton = await screen.findByRole("button", { name: "Choose Edmonton Oilers" });
    fireEvent.click(claimButton);
    expect(await screen.findByRole("heading", { name: "Main menu" })).toBeVisible();
    expect(repository.claimStarterTeam).toHaveBeenCalledWith(edmontonTeam.id);
    expect(repository.loadProfile).toHaveBeenCalledTimes(2);
    expect(repository.loadOwnCards).toHaveBeenCalledOnce();
    expect(repository.loadLineups).toHaveBeenCalledOnce();
  });

  it("shows the database error when a duplicate starter claim is rejected", async () => {
    const { auth } = createAuth(session);
    const repository = createRepository(onboardingProfile);
    vi.mocked(repository.claimStarterTeam).mockRejectedValue(new Error("Starter team has already been claimed."));
    renderGate(auth, repository);
    await screen.findByRole("heading", { name: "Choose your club" });
    selectEdmontonStarter();
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

  it("does not let a stale session restore overwrite a newer signed-out event", async () => {
    const { auth, emit } = createAuth();
    const restore = deferred<Session | null>();
    vi.mocked(auth.restoreSession).mockReturnValue(restore.promise);
    const repository = createRepository();
    renderGate(auth, repository);

    act(() => emit("SIGNED_OUT", null));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    await act(async () => { restore.resolve(session); });

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(repository.loadProfile).not.toHaveBeenCalled();
  });

  it.each(["purchase", "settlement"] as const)("keeps the account signed out when a delayed %s resolves", async (operation) => {
    const { auth, emit } = createAuth(session);
    const repository = createRepository();
    const pending = deferred<unknown>();
    if (operation === "purchase") {
      vi.mocked(repository.purchaseCard).mockReturnValue(pending.promise as ReturnType<AccountRepository["purchaseCard"]>);
    } else {
      vi.mocked(repository.settleMatch).mockReturnValue(pending.promise as ReturnType<AccountRepository["settleMatch"]>);
    }
    render(
      <AccountGate auth={auth} repository={repository}>
        {(_account, actions) => (
          <button onClick={() => {
            if (operation === "purchase") {
              void actions.purchaseCard({ clientRequestId: "request-1", offerId: "offer-1" });
            } else {
              void actions.settleMatch({ clientMatchId: "match-1" });
            }
          }}>Run mutation</button>
        )}
      </AccountGate>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Run mutation" }));
    await waitFor(() => expect(operation === "purchase" ? repository.purchaseCard : repository.settleMatch).toHaveBeenCalledOnce());

    act(() => emit("SIGNED_OUT", null));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeVisible();
    await act(async () => {
      pending.resolve(operation === "purchase"
        ? { status: "purchased", requestId: "request-1", offerId: "offer-1", cardId: "card-1", price: 100, credits: 900, quantity: 1, purchasedAt: "2026-07-13T00:00:00.000Z" }
        : { status: "settled", matchId: "match-1", rewardCredits: 100, credits: 1100, completedMatches: 1 });
    });

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Main menu" })).not.toBeInTheDocument();
    expect(repository.loadProfile).toHaveBeenCalledTimes(1);
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
