import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { AccountLineup, PublicRivalryChallenge } from "../../infrastructure/supabase";
import styles from "./RivalryChallenges.module.css";

export function ChallengeSetupScreen({ slug, lineups, starting, errorMessage, onAccept, onLoad }: {
  readonly slug: string;
  readonly lineups: readonly AccountLineup[];
  readonly starting: boolean;
  readonly errorMessage: string;
  readonly onAccept: (lineupId: string) => void;
  readonly onLoad: (slug: string) => Promise<PublicRivalryChallenge>;
}) {
  const [challenge, setChallenge] = useState<PublicRivalryChallenge | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void onLoad(slug).then((result) => { if (active) setChallenge(result); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "The challenge could not be loaded."); });
    return () => { active = false; };
  }, [onLoad, slug]);

  const lineup = challenge?.mode
    ? lineups.find((candidate) => candidate.mode === challenge.mode && candidate.isActive)
    : undefined;
  const unavailable = challenge && challenge.status !== "active";

  return (
    <main className={styles.setupPage}>
      <section className={styles.setupHero}>
        <p className={styles.eyebrow}>Ghost Rivalry</p>
        <h1>{challenge?.creatorLabel ? `Face ${challenge.creatorLabel}'s five` : "Loading the matchup…"}</h1>
        <p>The opposing five selections are fixed on the server. You see each card only after committing yours.</p>
      </section>
      <section className={styles.setupPanel} aria-live="polite">
        {loadError ? <p className={styles.inlineError} role="alert">{loadError}</p> : null}
        {unavailable ? <p className={styles.inlineError}>This rivalry is {challenge.status} and can no longer be accepted.</p> : null}
        {challenge?.status === "active" ? (
          <>
            <div className={styles.matchupLine}>
              <div><span>Your active lineup</span><strong>{lineup?.name ?? "No eligible active lineup"}</strong><small>{challenge.mode}</small></div>
              <b>VS</b>
              <div><span>Locked ghost</span><strong>{challenge.creatorLabel}</strong><small>OVR {challenge.challengeStrength} · {challenge.difficulty}</small></div>
            </div>
            <div className={styles.rulesBox}>
              <strong>How this is decided</strong>
              <p>Higher visible category value wins. On a category tie, higher OVR wins; if OVR also ties, the pre-match server seed decides.</p>
              <p>Ghost Rivalries grant no Credits, cards, goals, or progression. They are competition, not an economy shortcut.</p>
            </div>
            {lineup ? (
              <button className={styles.primaryAction} type="button" disabled={starting} onClick={() => onAccept(lineup.id)}>
                {starting ? "Locking the matchup…" : "Accept and enter the arena"}
              </button>
            ) : (
              <Link className={styles.primaryAction} to="/lineups">Build or activate this mode</Link>
            )}
          </>
        ) : null}
        {errorMessage ? <p className={styles.inlineError} role="alert">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
