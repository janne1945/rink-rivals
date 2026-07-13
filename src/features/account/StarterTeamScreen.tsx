import styles from "./AccountFlow.module.css";

interface StarterTeamScreenProps {
  readonly busy: boolean;
  readonly errorMessage: string;
  readonly displayName: string | null;
  readonly onClaim: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
}

const starterPlayers = [
  ["LW", "Brady Tkachuk"],
  ["C", "Connor McDavid"],
  ["RW", "Mikko Rantanen"],
  ["LD", "Rasmus Dahlin"],
  ["RD", "Evan Bouchard"],
  ["G", "Igor Shesterkin"],
] as const;

export function StarterTeamScreen({ busy, errorMessage, displayName, onClaim, onLogout }: StarterTeamScreenProps) {
  return (
    <main className={styles.onboardingPage}>
      <header className={styles.onboardingHeader}>
        <div className={styles.brandLockup}><span className={styles.brandMark} aria-hidden="true">RR</span><span>Rink Rivals</span></div>
        <button className={styles.textButton} type="button" disabled={busy} onClick={() => void onLogout()}>Sign out</button>
      </header>
      <section className={styles.onboardingCard} aria-labelledby="starter-heading">
        <div>
          <p className={styles.eyebrow}>Welcome{displayName ? `, ${displayName}` : ""}</p>
          <h1 id="starter-heading">Choose your first six</h1>
          <p className={styles.intro}>Your starter team includes one card for every position and 1,000 Credits.</p>
        </div>
        <article className={styles.teamCard} aria-label="Edmonton Oilers starter team">
          <div className={styles.teamHeading}>
            <span className={styles.teamMonogram} aria-hidden="true">EDM</span>
            <div><h2>Edmonton Oilers</h2><p>NHL Circuit starter</p></div>
            <span className={styles.selectedBadge}>Available</span>
          </div>
          <ul className={styles.roster}>
            {starterPlayers.map(([slot, name]) => <li key={slot}><span>{slot}</span>{name}</li>)}
          </ul>
          <div className={styles.claimSummary}><strong>6 Base Cards</strong><strong>1,000 Credits</strong></div>
          {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
          <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void onClaim()}>
            {busy ? "Building your club…" : "Choose Edmonton Oilers"}
          </button>
        </article>
      </section>
    </main>
  );
}
