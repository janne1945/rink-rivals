import { useState } from "react";
import { MATCH_REWARDS, type AiDifficulty } from "../../domain/battle";
import type { GameMode, Lineup } from "../../domain/lineups";
import { AI_TIER_THRESHOLDS } from "../../domain/progression";
import { Button } from "../../shared/Button";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import styles from "../Screens.module.css";

const modes: Array<{ id: GameMode; label: string; kicker: string; copy: string }> = [
  { id: "nhl-circuit", label: "NHL Circuit", kicker: "League locked", copy: "Take a six-card NHL lineup through a pure circuit matchup." },
  { id: "pwhl-circuit", label: "PWHL Circuit", kicker: "League locked", copy: "Build around PWHL stars and face a dedicated circuit rival." },
  { id: "open-ice", label: "Open Ice", kicker: "Fantasy lineup", copy: "Mix both leagues freely. No penalty, only the right card for the moment." },
];

const difficultyCopy: Readonly<Record<AiDifficulty, { label: string; copy: string }>> = {
  rookie: { label: "Rookie", copy: "A forgiving rival that explores more possible plays." },
  pro: { label: "Pro", copy: "A sharper opponent that prefers strong situational choices." },
  elite: { label: "Elite", copy: "The toughest read, saving its best answers for the right shift." },
};

const difficulties = AI_TIER_THRESHOLDS.map((threshold) => ({
  ...threshold,
  ...difficultyCopy[threshold.id],
}));

export interface PlayScreenProps {
  readonly lineups: readonly Lineup[];
  readonly activeLineupIds: Record<string, string>;
  readonly collectionScore?: number;
  readonly preferredDifficulty?: AiDifficulty;
  readonly starting?: boolean;
  readonly startError?: string;
  readonly onDifficultyChange?: (difficulty: AiDifficulty) => void;
  readonly onStart: (mode: GameMode, difficulty: AiDifficulty) => Promise<void> | void;
  readonly onStartArena: (mode: GameMode) => Promise<void> | void;
  readonly onOpenLive: () => void;
  readonly onOpenSeason: () => void;
}

export function PlayScreen({
  lineups,
  activeLineupIds,
  collectionScore = 0,
  preferredDifficulty = "rookie",
  starting = false,
  startError,
  onDifficultyChange,
  onStart,
  onStartArena,
  onOpenLive,
  onOpenSeason,
}: PlayScreenProps) {
  const initialMode = modes.find((mode) => lineups.some((lineup) => lineup.id === activeLineupIds[mode.id]))?.id ?? "nhl-circuit";
  const [selected, setSelected] = useState<GameMode>(initialMode);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(preferredDifficulty);
  const active = lineups.find((lineup) => lineup.id === activeLineupIds[selected]);
  const selectedDifficulty = difficulties.find((option) => option.id === difficulty) ?? difficulties[0];
  const difficultyUnlocked = collectionScore >= selectedDifficulty.minimumCollectionScore;
  const rewards = MATCH_REWARDS[difficulty];

  function chooseDifficulty(nextDifficulty: AiDifficulty, minimumCollectionScore: number) {
    if (collectionScore < minimumCollectionScore) return;
    setDifficulty(nextDifficulty);
    onDifficultyChange?.(nextDifficulty);
  }

  return (
    <div className={`${styles.page} ${styles.playPage}`}>
      <header>
        <p className={styles.eyebrow}>Three ways to compete</p>
        <h1 className={styles.title}>Play</h1>
        <p className={styles.lede}>Face the server, challenge a real club’s lineup in Rivalry Arena, or meet a friend live with a private room code.</p>
      </header>
      <div className={styles.competitionGrid}>
        <section className={`${styles.competitionCard} ${styles.faceoffCard}`}>
          <span>01 · Solo</span><h2>Faceoff</h2><p>Five transparent Quartett rounds against a server-built opponent. Earn Credits, goals, and Season XP.</p><a href="#faceoff-setup">Configure Faceoff ↓</a>
        </section>
        <section className={`${styles.competitionCard} ${styles.arenaCard}`}>
          <span>02 · Real lineup, server AI</span><h2>Rivalry Arena</h2><p>The server finds the closest valid active lineup from another real club and controls it. No ranking or divisions.</p><Button disabled={!active || starting} onClick={() => void onStartArena(selected)}>{starting ? "Finding rival…" : "Enter Arena"}</Button>
        </section>
        <section className={`${styles.competitionCard} ${styles.liveCard}`}>
          <span>03 · Two players live</span><h2>Ghost Challenge</h2><p>Create or enter a six-character code. Both players lock hidden choices simultaneously. Pure rivalry, zero rewards.</p><Button onClick={onOpenLive}>Open Live rooms</Button>
        </section>
      </div>
      <button type="button" className={styles.seasonCallout} onClick={onOpenSeason}><span><strong>Season Locker</strong> · 30 visible, guaranteed rewards</span><b>View progress →</b></button>
      <div className={styles.modeGrid}>
        {modes.map((mode) => (
          <button key={mode.id} className={`${styles.modeCard} ${selected === mode.id ? styles.modeSelected : ""}`} onClick={() => setSelected(mode.id)} aria-pressed={selected === mode.id}>
            <small>{mode.kicker}</small><h3>{mode.label}</h3><p>{mode.copy}</p>
          </button>
        ))}
      </div>
      <section id="faceoff-setup" aria-labelledby="difficulty-heading">
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Rival strength</p><h2 id="difficulty-heading">Choose difficulty</h2></div>
          <p>Collection score: {collectionScore.toLocaleString("en-US")}</p>
        </div>
        <div className={styles.difficultyGrid}>
          {difficulties.map((option) => {
            const unlocked = collectionScore >= option.minimumCollectionScore;
            const scoreNeeded = Math.max(0, option.minimumCollectionScore - collectionScore);
            return (
              <button
                key={option.id}
                type="button"
                className={`${styles.difficultyCard} ${difficulty === option.id ? styles.difficultySelected : ""} ${!unlocked ? styles.difficultyLocked : ""}`}
                aria-pressed={unlocked ? difficulty === option.id : undefined}
                aria-disabled={!unlocked}
                onClick={() => chooseDifficulty(option.id, option.minimumCollectionScore)}
              >
                <span className={styles.difficultyTopline}><strong>{option.label}</strong><span>{unlocked ? "Unlocked" : "Locked"}</span></span>
                <p>{option.copy}</p>
                <small>{unlocked ? `Win +${formatRivalryPoints(MATCH_REWARDS[option.id].player)}` : `${scoreNeeded.toLocaleString("en-US")} more Collection Score`}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Active six</p>
            <h2>{active?.name ?? "No valid lineup"}</h2>
            <p>{selectedDifficulty.label} · five rounds · goalie guaranteed</p>
            <p className={styles.rewardRange}>Win +{formatRivalryPoints(rewards.player)} · Draw +{formatRivalryPoints(rewards.tie)} · Loss +{formatRivalryPoints(rewards.opponent)}</p>
          </div>
          <Button onClick={() => void onStart(selected, difficulty)} disabled={!active || !difficultyUnlocked || starting}>{starting ? "Preparing rival…" : "Start match"}</Button>
        </div>
        {startError ? <p className={styles.error} role="alert">{startError}</p> : null}
      </section>
    </div>
  );
}
