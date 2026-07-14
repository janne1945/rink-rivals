import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { rivalryPointsLabel } from "../shared/rivalryPoints";
import styles from "./AppShell.module.css";

const navItems = [
  ["/", "⌂", "Home"],
  ["/collection", "◇", "Cards"],
  ["/lineups", "Ⅵ", "Lineup"],
  ["/play", "▶", "Play"],
  ["/market", "✦", "Market"],
] as const;

interface AppShellProps {
  readonly credits: number;
  readonly displayName: string | null;
  readonly onLogout: () => Promise<void>;
  readonly logoutBusy?: boolean;
  readonly logoutError?: string;
  readonly children: ReactNode;
}

export function AppShell({ credits, displayName, onLogout, logoutBusy = false, logoutError, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink className={styles.brand} to="/" aria-label="Rink Rivals home">
            <span className={styles.mark} aria-hidden="true">RR</span>
            <span>
              <span className={styles.wordmark}>Rink Rivals</span>
              <span className={styles.tagline}>Two leagues. One collection.</span>
            </span>
          </NavLink>
          <div className={styles.accountActions}>
            <div className={styles.credits} aria-label={rivalryPointsLabel(credits)}>
              {credits.toLocaleString("en-US")} <span>RP</span>
            </div>
            <button className={styles.logout} type="button" disabled={logoutBusy} onClick={() => void onLogout()} aria-label={`Sign out${displayName ? ` ${displayName}` : ""}`}>
              {logoutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      {logoutError ? <p className={styles.accountError} role="alert">{logoutError}</p> : null}

      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navInner}>
          {navItems.map(([to, icon, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}
            >
              <span className={styles.navIcon} aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
      <footer className={styles.disclaimer}>
        Unofficial, non-commercial prototype. Not affiliated with or endorsed by the NHL, PWHL, their teams, or players.
      </footer>
    </div>
  );
}
