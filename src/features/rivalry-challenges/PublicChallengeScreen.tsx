import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { AccountRepository, PublicRivalryChallenge } from "../../infrastructure/supabase";
import styles from "./RivalryChallenges.module.css";

const modeLabels = {
  "nhl-circuit": "NHL Circuit",
  "pwhl-circuit": "PWHL Circuit",
  "open-ice": "Open Ice",
} as const;

export function PublicChallengeScreen({ repository, slug }: {
  readonly repository: AccountRepository;
  readonly slug: string;
}) {
  const [challenge, setChallenge] = useState<PublicRivalryChallenge | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setChallenge(null);
    setError("");
    void repository.loadPublicRivalryChallenge(slug)
      .then((result) => { if (active) setChallenge(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The rivalry could not be loaded.");
      });
    return () => { active = false; };
  }, [repository, slug]);

  const unavailable = challenge && challenge.status !== "active";
  return (
    <main className={styles.publicPage}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.publicHeader}>
        <Link to="/" className={styles.brand}><span>RR</span> Rink Rivals</Link>
        <span className={styles.liveChip}>Ghost Rivalry</span>
      </header>
      <section className={styles.inviteCard} aria-labelledby="challenge-title">
        {!challenge && !error ? (
          <div className={styles.loading} role="status"><span /> Loading the matchup…</div>
        ) : error ? (
          <><p className={styles.eyebrow}>Challenge unavailable</p><h1 id="challenge-title">The ice went quiet.</h1><p className={styles.lead}>{error}</p></>
        ) : challenge?.status === "missing" ? (
          <><p className={styles.eyebrow}>Link not found</p><h1 id="challenge-title">No rivalry lives here.</h1><p className={styles.lead}>The link may be incomplete or no longer exist.</p></>
        ) : challenge ? (
          <>
            <p className={styles.eyebrow}>{unavailable ? "Final horn" : "You have been challenged"}</p>
            <h1 id="challenge-title"><span>{challenge.creatorLabel}</span> left a team on the ice.</h1>
            <p className={styles.lead}>
              Five transparent category battles. Their five card choices are already locked and hidden. Your lineup decides the answer.
            </p>
            <dl className={styles.challengeStats}>
              <div><dt>Format</dt><dd>{challenge.mode ? modeLabels[challenge.mode] : "—"}</dd></div>
              <div><dt>Level</dt><dd>{challenge.difficulty}</dd></div>
              <div><dt>Ghost OVR</dt><dd>{challenge.challengeStrength}</dd></div>
            </dl>
            {unavailable ? (
              <p className={styles.unavailable} role="status">
                This challenge has been {challenge.status}. Ask for a fresh rivalry link.
              </p>
            ) : (
              <Link className={styles.primaryAction} to={`/accept/${challenge.slug}`}>Sign in to face the ghost</Link>
            )}
            <p className={styles.fairPlay}>No entry fee. No economy rewards. One server-authoritative attempt you can safely resume.</p>
          </>
        ) : null}
      </section>
      <footer className={styles.publicFooter}>Unofficial hockey prototype · No card identities are exposed before reveal</footer>
    </main>
  );
}
