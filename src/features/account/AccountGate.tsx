import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import type {
  AuthCredentials,
  AuthService,
  RegistrationCredentials,
  AccountRepository,
  ClaimRivalryRewardInput,
  ClaimRivalryRewardResult,
  LineupMutationResult,
  PlayMatchRoundInput,
  PlayMatchRoundResult,
  PurchaseCardInput,
  PurchaseCardResult,
  SaveLineupInput,
  SettleMatchInput,
  SettleMatchResult,
  StartMatchInput,
  StartMatchResult,
} from "../../infrastructure/supabase";
import { AuthScreen } from "./AuthScreen";
import { StarterTeamScreen } from "./StarterTeamScreen";
import type { AccountSnapshot } from "./types";
import styles from "./AccountFlow.module.css";

interface AccountGateProps {
  readonly auth: AuthService;
  readonly repository: AccountRepository;
  readonly children: (account: AccountSnapshot, actions: AccountActions) => ReactNode;
}

export interface AccountActions {
  readonly logout: () => Promise<void>;
  readonly busy: boolean;
  readonly errorMessage: string;
  readonly purchaseCard: (input: PurchaseCardInput) => Promise<PurchaseCardResult>;
  readonly saveLineup: (input: SaveLineupInput) => Promise<LineupMutationResult>;
  readonly activateLineup: (lineupId: string) => Promise<LineupMutationResult>;
  readonly claimRivalryReward: (input: ClaimRivalryRewardInput) => Promise<ClaimRivalryRewardResult>;
  readonly startMatch: (input: StartMatchInput) => Promise<StartMatchResult>;
  readonly playMatchRound: (input: PlayMatchRoundInput) => Promise<PlayMatchRoundResult>;
  readonly settleMatch: (input: SettleMatchInput) => Promise<SettleMatchResult>;
}

type GateState =
  | { readonly status: "booting" }
  | { readonly status: "signed-out" }
  | { readonly status: "loading-account" }
  | { readonly status: "onboarding"; readonly account: AccountSnapshot }
  | { readonly status: "ready"; readonly account: AccountSnapshot }
  | { readonly status: "error"; readonly message: string };

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

const emptyMarket = {
  serverTime: new Date(0).toISOString(),
  currentEvent: null,
  offers: [],
} as const;

export function AccountGate({ auth, repository, children }: AccountGateProps) {
  const [state, setState] = useState<GateState>({ status: "booting" });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const loadVersion = useRef(0);
  const actionBusyRef = useRef(false);

  async function loadReadyAccount(profile: Awaited<ReturnType<AccountRepository["loadProfile"]>>): Promise<AccountSnapshot> {
    const [cards, lineups, objectives, rivalryRoad, market] = await Promise.all([
      repository.loadOwnCards(), repository.loadLineups(),
      repository.loadObjectiveProgress(), repository.loadRivalryRoadProgress(), repository.loadMarketState(),
    ]);
    return { profile, cards, lineups, objectives, rivalryRoad, market };
  }

  function beginAction(): boolean {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = true;
    setActionBusy(true);
    return true;
  }

  function endAction(): void {
    actionBusyRef.current = false;
    setActionBusy(false);
  }

  async function loadAccount(session: Session): Promise<void> {
    const version = ++loadVersion.current;
    setState({ status: "loading-account" });
    try {
      const profile = await repository.loadProfile();
      if (version !== loadVersion.current) return;
      if (!profile.onboardingCompleted) {
        setState({ status: "onboarding", account: {
          profile, cards: [], lineups: [], objectives: [], market: emptyMarket,
          rivalryRoad: { currentStepIndex: 0, completedStepIds: [], status: "in-progress", selectedCardId: null },
        } });
        return;
      }
      const account = await loadReadyAccount(profile);
      if (version === loadVersion.current && session.user.id === profile.id) {
        setState({ status: "ready", account });
      }
    } catch (error) {
      if (version === loadVersion.current) setState({ status: "error", message: messageFor(error) });
    }
  }

  useEffect(() => {
    let active = true;
    const restoreVersion = loadVersion.current;
    const unsubscribe = auth.subscribe((_event, session) => {
      if (!active) return;
      setActionError("");
      if (session) void loadAccount(session);
      else {
        loadVersion.current += 1;
        setState({ status: "signed-out" });
      }
    });
    void auth.restoreSession().then((session) => {
      if (!active || restoreVersion !== loadVersion.current) return;
      if (session) void loadAccount(session);
      else {
        loadVersion.current += 1;
        setState({ status: "signed-out" });
      }
    }).catch((error: unknown) => {
      if (active && restoreVersion === loadVersion.current) setState({ status: "error", message: messageFor(error) });
    });
    return () => {
      active = false;
      loadVersion.current += 1;
      unsubscribe();
    };
  }, [auth, repository]);

  const marketRefreshKey = state.status === "ready"
    ? `${state.account.market.serverTime}:${state.account.market.currentEvent?.endsAt ?? "none"}`
    : "";

  useEffect(() => {
    if (state.status !== "ready") return;
    let active = true;
    const market = state.account.market;
    const serverTime = Date.parse(market.serverTime);
    const eventEnd = market.currentEvent ? Date.parse(market.currentEvent.endsAt) : Number.NaN;
    const remaining = Number.isFinite(serverTime) && Number.isFinite(eventEnd) ? eventEnd - serverTime : 60_000;
    const refreshDelay = market.currentEvent ? Math.max(1_000, remaining + 500) : 60_000;
    const refreshMarket = async () => {
      try {
        const refreshed = await repository.loadMarketState();
        if (!active) return;
        setState((current) => current.status === "ready"
          ? { status: "ready", account: { ...current.account, market: refreshed } }
          : current);
      } catch (error) {
        if (active) setActionError(messageFor(error));
      }
    };
    const timer = window.setTimeout(() => void refreshMarket(), refreshDelay);
    const onFocus = () => void refreshMarket();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [marketRefreshKey, repository]);

  async function login(credentials: AuthCredentials) {
    if (!beginAction()) return;
    setActionError("");
    setActionSuccess("");
    try {
      const session = await auth.login(credentials);
      await loadAccount(session);
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      endAction();
    }
  }

  async function register(credentials: RegistrationCredentials) {
    if (!beginAction()) return;
    setActionError("");
    setActionSuccess("");
    try {
      const session = await auth.register(credentials);
      if (session) await loadAccount(session);
      else setActionSuccess("Account created. Check your email to confirm your address, then sign in.");
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      endAction();
    }
  }

  async function logout() {
    if (!beginAction()) return;
    setActionError("");
    try {
      await auth.logout();
      loadVersion.current += 1;
      setState({ status: "signed-out" });
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      endAction();
    }
  }

  async function claimStarterTeam() {
    if (state.status !== "onboarding") return;
    if (!beginAction()) return;
    const version = loadVersion.current;
    setActionError("");
    try {
      await repository.claimStarterTeam("edmonton-oilers");
      if (version !== loadVersion.current) return;
      const profile = await repository.loadProfile();
      if (version !== loadVersion.current) return;
      const account = await loadReadyAccount(profile);
      if (version === loadVersion.current) setState({ status: "ready", account });
    } catch (error) {
      if (version === loadVersion.current) setActionError(messageFor(error));
    } finally {
      endAction();
    }
  }

  async function refreshAfterMutation<T>(operation: () => Promise<T>): Promise<T> {
    const version = loadVersion.current;
    const result = await operation();
    if (version !== loadVersion.current) return result;
    const profile = await repository.loadProfile();
    if (version !== loadVersion.current) return result;
    const account = await loadReadyAccount(profile);
    if (version === loadVersion.current) setState({ status: "ready", account });
    return result;
  }

  function purchaseCard(input: PurchaseCardInput): Promise<PurchaseCardResult> {
    return refreshAfterMutation(() => repository.purchaseCard(input));
  }

  function saveLineup(input: SaveLineupInput): Promise<LineupMutationResult> {
    return refreshAfterMutation(() => repository.saveLineup(input));
  }

  function activateLineup(lineupId: string): Promise<LineupMutationResult> {
    return refreshAfterMutation(() => repository.activateLineup(lineupId));
  }

  function claimRivalryReward(input: ClaimRivalryRewardInput): Promise<ClaimRivalryRewardResult> {
    return refreshAfterMutation(() => repository.claimRivalryReward(input));
  }

  function startMatch(input: StartMatchInput): Promise<StartMatchResult> {
    return repository.startMatch(input);
  }

  function playMatchRound(input: PlayMatchRoundInput): Promise<PlayMatchRoundResult> {
    return repository.playMatchRound(input);
  }

  async function settleMatch(input: SettleMatchInput): Promise<SettleMatchResult> {
    return refreshAfterMutation(() => repository.settleMatch(input));
  }

  if (state.status === "booting" || state.status === "loading-account") {
    return <AccountLoading label={state.status === "booting" ? "Restoring your session…" : "Loading your club…"} />;
  }
  if (state.status === "signed-out") {
    return <AuthScreen busy={actionBusy} errorMessage={actionError} successMessage={actionSuccess} onLogin={login} onRegister={register} />;
  }
  if (state.status === "onboarding") {
    return <StarterTeamScreen busy={actionBusy} errorMessage={actionError} displayName={state.account.profile.displayName} onClaim={claimStarterTeam} onLogout={logout} />;
  }
  if (state.status === "error") {
    return (
      <main className={styles.accountLoading}>
        <section className={styles.loadError} role="alert"><h1>We couldn’t load your club</h1><p>{state.message}</p><button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Try again</button></section>
      </main>
    );
  }
  return <>{children(state.account, {
    logout,
    busy: actionBusy,
    errorMessage: actionError,
    purchaseCard,
    saveLineup,
    activateLineup,
    claimRivalryReward,
    startMatch,
    playMatchRound,
    settleMatch,
  })}</>;
}

function AccountLoading({ label }: { readonly label: string }) {
  return <main className={styles.accountLoading}><div><div className={styles.loaderPuck} /><h1>Preparing the ice</h1><p>{label}</p></div></main>;
}
