import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { rivalryPointsLabel } from "../shared/rivalryPoints";
import styles from "./AppShell.module.css";

const navItems = [
  ["/", "Home"],
  ["/collection", "Cards"],
  ["/lineups", "Lineup"],
  ["/play", "Play"],
  ["/market", "Market"],
] as const;

interface AppShellProps {
  readonly credits: number;
  readonly displayName: string | null;
  readonly seasonXp?: number;
  readonly onLogout: () => Promise<void>;
  readonly logoutBusy?: boolean;
  readonly logoutError?: string;
  readonly immersive?: boolean;
  readonly children: ReactNode;
}

export function AppShell({ credits, displayName, seasonXp = 0, onLogout, logoutBusy = false, logoutError, immersive = false, children }: AppShellProps) {
  const level = Math.max(1, Math.floor(seasonXp / 1_000) + 1);
  const levelProgress = seasonXp % 1_000;

  return (
    <div className={`${styles.shell} ${immersive ? styles.immersive : ""}`}>
      <header className={styles.header} aria-hidden={immersive || undefined}>
        <div className={styles.headerInner}>
          <NavLink className={styles.brand} to="/" aria-label="Rink Rivals home">
            <img className={styles.mark} src="/assets/ui/rink-rivals-crest.svg" alt="" />
            <span>
              <span className={styles.wordmark}>Rink Rivals</span>
              <span className={styles.tagline}>Two leagues. One collection.</span>
            </span>
          </NavLink>
          <nav className={styles.nav} aria-label="Main navigation">
            <div className={styles.navInner}>
              {navItems.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
          <div className={styles.accountActions}>
            <div className={styles.currency} aria-label={rivalryPointsLabel(credits)}><i aria-hidden="true" /><strong>{credits.toLocaleString("en-US")}</strong></div>
            <div className={`${styles.currency} ${styles.shards}`} aria-label="1,250 shards"><i aria-hidden="true">◆</i><strong>1,250</strong></div>
            <div className={styles.profile}>
              <span className={styles.levelBadge}>{level}</span>
              <span className={styles.profileCopy}><strong>{displayName ?? "Rival"}</strong><small>{levelProgress.toLocaleString("en-US")} / 1,000 EP</small><span><i style={{ width: `${levelProgress / 10}%` }} /></span></span>
            </div>
            <button className={styles.logout} type="button" disabled={logoutBusy} onClick={() => void onLogout()} aria-label={`Sign out${displayName ? ` ${displayName}` : ""}`} title="Sign out">
              {logoutBusy ? "…" : "↗"}
            </button>
          </div>
        </div>
      </header>

      {logoutError && !immersive ? <p className={styles.accountError} role="alert">{logoutError}</p> : null}

      <main className={styles.main}>{children}</main>
      <footer className={styles.disclaimer} aria-hidden={immersive || undefined}>
        Unofficial, non-commercial prototype. Not affiliated with or endorsed by the NHL, PWHL, their teams, or players.
      </footer>
    </div>
  );
}
