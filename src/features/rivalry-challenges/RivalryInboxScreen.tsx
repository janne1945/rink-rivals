import { useCallback, useEffect, useState } from "react";

import type { RivalryChallengeSummary } from "../../infrastructure/supabase";
import styles from "./RivalryChallenges.module.css";

async function shareChallenge(challenge: RivalryChallengeSummary): Promise<"shared" | "copied"> {
  const url = `${window.location.origin}/c/${challenge.slug}`;
  if (navigator.share) {
    await navigator.share({ title: "Face my Rink Rivals ghost", text: `Can you beat my ${challenge.challengeStrength} OVR five?`, url });
    return "shared";
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

export function RivalryInboxScreen({ onLoad, onRevoke }: {
  readonly onLoad: () => Promise<readonly RivalryChallengeSummary[]>;
  readonly onRevoke: (slug: string) => Promise<void>;
}) {
  const [challenges, setChallenges] = useState<readonly RivalryChallengeSummary[]>([]);
  const [busySlug, setBusySlug] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try { setChallenges(await onLoad()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Rivalries could not be loaded."); }
  }, [onLoad]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function revoke(slug: string) {
    setBusySlug(slug); setError(""); setStatus("");
    try { await onRevoke(slug); setStatus("Challenge revoked. Existing accepted attempts can still finish safely."); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The challenge could not be revoked."); }
    finally { setBusySlug(""); }
  }

  async function share(challenge: RivalryChallengeSummary) {
    setError(""); setStatus("");
    try { const result = await shareChallenge(challenge); setStatus(result === "shared" ? "Challenge shared." : "Challenge link copied."); }
    catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("Sharing was unavailable. Copy the link from your browser address bar and try again.");
    }
  }

  return (
    <main className={styles.inboxPage}>
      <header className={styles.inboxHeader}><p className={styles.eyebrow}>Async competition</p><h1>Ghost Rivalries</h1><p>Your finished five becomes a fair, fixed challenge for friends. Links expire after 30 days.</p></header>
      {status ? <p className={styles.status} role="status">{status}</p> : null}
      {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
      <section className={styles.challengeGrid} aria-label="Created challenges">
        {challenges.length === 0 && !error ? <div className={styles.emptyInbox}><strong>No ghosts on the ice yet.</strong><span>Finish a match, then create a rivalry from the final screen.</span></div> : null}
        {challenges.map((challenge) => (
          <article className={styles.summaryCard} key={challenge.slug}>
            <div><span className={`${styles.statusChip} ${styles[`status_${challenge.status}`]}`}>{challenge.status}</span><small>{challenge.mode} · {challenge.difficulty}</small></div>
            <h2>{challenge.challengeStrength} <span>OVR ghost</span></h2>
            <dl><div><dt>Attempts</dt><dd>{challenge.attempts}</dd></div><div><dt>Defenses</dt><dd>{challenge.ghostDefenses}</dd></div><div><dt>Beaten</dt><dd>{challenge.challengerWins}</dd></div></dl>
            <div className={styles.cardActions}>
              <button type="button" disabled={challenge.status !== "active"} onClick={() => void share(challenge)}>Share</button>
              <button type="button" disabled={challenge.status !== "active" || busySlug === challenge.slug} onClick={() => void revoke(challenge.slug)}>{busySlug === challenge.slug ? "Revoking…" : "Revoke"}</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
