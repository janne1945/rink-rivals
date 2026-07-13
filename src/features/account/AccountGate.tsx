import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import type {
  AuthCredentials,
  AuthService,
  RegistrationCredentials,
  AccountRepository,
  SettleMatchInput,
  SettleMatchResult,
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

export function AccountGate({ auth, repository, children }: AccountGateProps) {
  const [state, setState] = useState<GateState>({ status: "booting" });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const loadVersion = useRef(0);

  async function loadReadyAccount(profile: Awaited<ReturnType<AccountRepository["loadProfile"]>>): Promise<AccountSnapshot> {
    const [cards, activeLineup, objectives, rivalryRoad] = await Promise.all([
      repository.loadOwnCards(), repository.loadLineup(),
      repository.loadObjectiveProgress(), repository.loadRivalryRoadProgress(),
    ]);
    return { profile, cards, activeLineup, objectives, rivalryRoad };
  }

  async function loadAccount(session: Session): Promise<void> {
    const version = ++loadVersion.current;
    setState({ status: "loading-account" });
    try {
      const profile = await repository.loadProfile();
      if (version !== loadVersion.current) return;
      if (!profile.onboardingCompleted) {
        setState({ status: "onboarding", account: {
          profile, cards: [], activeLineup: null, objectives: [],
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
      if (!active) return;
      if (session) void loadAccount(session);
      else setState({ status: "signed-out" });
    }).catch((error: unknown) => {
      if (active) setState({ status: "error", message: messageFor(error) });
    });
    return () => {
      active = false;
      loadVersion.current += 1;
      unsubscribe();
    };
  }, [auth, repository]);

  async function login(credentials: AuthCredentials) {
    setActionBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const session = await auth.login(credentials);
      await loadAccount(session);
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function register(credentials: RegistrationCredentials) {
    setActionBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const session = await auth.register(credentials);
      if (session) await loadAccount(session);
      else setActionSuccess("Account created. Check your email to confirm your address, then sign in.");
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function logout() {
    setActionBusy(true);
    setActionError("");
    try {
      await auth.logout();
      loadVersion.current += 1;
      setState({ status: "signed-out" });
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function claimStarterTeam() {
    if (state.status !== "onboarding") return;
    setActionBusy(true);
    setActionError("");
    try {
      await repository.claimStarterTeam("edmonton-oilers");
      const profile = await repository.loadProfile();
      setState({ status: "ready", account: await loadReadyAccount(profile) });
    } catch (error) {
      setActionError(messageFor(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function settleMatch(input: SettleMatchInput): Promise<SettleMatchResult> {
    const result = await repository.settleMatch(input);
    const profile = await repository.loadProfile();
    setState({ status: "ready", account: await loadReadyAccount(profile) });
    return result;
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
  return <>{children(state.account, { logout, settleMatch })}</>;
}

function AccountLoading({ label }: { readonly label: string }) {
  return <main className={styles.accountLoading}><div><div className={styles.loaderPuck} /><h1>Preparing the ice</h1><p>{label}</p></div></main>;
}
