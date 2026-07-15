import { useMemo, useRef, useState } from "react";

import type { ContentCatalog } from "../../domain/cards";
import type { ClaimSeasonRewardResult, SeasonLockerState } from "../../infrastructure/supabase";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "./SeasonLockerScreen.module.css";

interface SeasonLockerScreenProps {
  readonly locker: SeasonLockerState;
  readonly catalog: ContentCatalog;
  readonly onClaim: (seasonId: string, tier: number, clientRequestId: string) => Promise<ClaimSeasonRewardResult>;
}

const rewardGlyphs: Record<string, string> = {
  credits: "RP",
  emblem: "◆",
  banner: "▰",
  title: "Aa",
  "broadcast-sting": "♫",
  card: "★",
};

export function SeasonLockerScreen({ locker, catalog, onClaim }: SeasonLockerScreenProps) {
  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestIds = useRef(new Map<number, string>());
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog.players]);
  const maxXp = locker.rewards.at(-1)?.xpRequired ?? 3000;
  const progress = Math.min(100, Math.round((locker.xp / maxXp) * 100));
  const remainingMs = locker.season ? Date.parse(locker.season.endsAt) - Date.parse(locker.serverTime) : 0;
  const daysLeft = Math.max(0, Math.ceil(remainingMs / 86_400_000));

  async function claim(tier: number): Promise<void> {
    if (!locker.season || claimingTier !== null) return;
    setClaimingTier(tier);
    setError("");
    setMessage("");
    const requestId = requestIds.current.get(tier) ?? crypto.randomUUID();
    requestIds.current.set(tier, requestId);
    try {
      const result = await onClaim(locker.season.id, tier, requestId);
      requestIds.current.delete(tier);
      setMessage(result.status === "already-claimed"
        ? `Tier ${tier} was already secured. Nothing was granted twice.`
        : `Tier ${tier} secured. The reward is now in your club.`);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "The reward could not be claimed.");
    } finally {
      setClaimingTier(null);
    }
  }

  if (!locker.season) {
    return <div className={styles.page} data-season-screen><section className={styles.empty}><p>Season Locker unavailable.</p></section></div>;
  }

  return (
    <div className={styles.page} data-season-screen>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>28 days · free for every club</p>
          <h1>{locker.season.name}</h1>
          <p>{locker.season.description}</p>
          <div className={styles.rules} aria-label="Season rules">
            <span>No paid track</span><span>No premium currency</span><span>No random rewards</span>
          </div>
        </div>
        <div className={styles.seasonMark} aria-label={`${daysLeft} days remaining`}>
          <strong>{daysLeft}</strong><span>days left</span>
        </div>
      </header>

      <section className={styles.progressPanel} aria-labelledby="locker-progress-heading">
        <div className={styles.progressCopy}>
          <div><p className={styles.eyebrow}>Your season</p><h2 id="locker-progress-heading">{locker.xp.toLocaleString("en-US")} XP</h2></div>
          <p>{locker.faceoffMatches} Faceoffs · {locker.arenaMatches} Arena matches</p>
        </div>
        <div className={styles.progressTrack} role="progressbar" aria-labelledby="locker-progress-heading" aria-valuemin={0} aria-valuemax={maxXp} aria-valuenow={Math.min(locker.xp, maxXp)}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.sourceNote}>Season XP comes from Faceoff and Rivalry Arena. Private Live Ghost matches stay reward-free.</p>
      </section>

      {(message || error) ? <p className={error ? styles.error : styles.success} role={error ? "alert" : "status"}>{error || message}</p> : null}

      <section aria-labelledby="locker-rewards-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Everything visible</p><h2 id="locker-rewards-heading">30 guaranteed rewards</h2></div>
          <p>{locker.rewards.filter((reward) => reward.claimed).length} / 30 claimed</p>
        </div>
        <ol className={styles.rewardGrid}>
          {locker.rewards.map((reward) => {
            const card = reward.cardId ? catalog.cards.find((candidate) => candidate.id === reward.cardId) : undefined;
            const player = card ? players.get(card.playerId) : undefined;
            const claimable = locker.status === "active" && reward.unlocked && !reward.claimed;
            return (
              <li key={reward.tier} className={`${styles.reward} ${reward.unlocked ? styles.unlocked : styles.locked} ${reward.claimed ? styles.claimed : ""}`}>
                <div className={styles.rewardTopline}><span>Tier {reward.tier}</span><strong>{reward.xpRequired.toLocaleString("en-US")} XP</strong></div>
                {card && player ? (
                  <HockeyCard compact card={card} player={player} status={reward.claimed ? "Claimed" : "Season reward"} />
                ) : (
                  <div className={styles.glyph} aria-hidden="true">{rewardGlyphs[reward.rewardType]}</div>
                )}
                <div className={styles.rewardCopy}>
                  <h3>{reward.label}</h3>
                  <p>{reward.description}</p>
                </div>
                {reward.claimed ? <span className={styles.claimedLabel}>Secured ✓</span> : (
                  <Button disabled={!claimable || claimingTier !== null} onClick={() => void claim(reward.tier)}>
                    {claimingTier === reward.tier ? "Claiming…" : reward.unlocked ? "Claim reward" : `${Math.max(0, reward.xpRequired - locker.xp)} XP to go`}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
