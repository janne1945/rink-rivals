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
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Choose your ice</p>
        <h1 className={styles.title}>Faceoff</h1>
        <p className={styles.lede}>Five situations. Five hidden selections. Read the matchup and save the right card for the right shift.</p>
      </header>
      <div className={styles.modeGrid}>
        {modes.map((mode) => (
          <button key={mode.id} className={`${styles.modeCard} ${selected === mode.id ? styles.modeSelected : ""}`} onClick={() => setSelected(mode.id)} aria-pressed={selected === mode.id}>
            <small>{mode.kicker}</small><h3>{mode.label}</h3><p>{mode.copy}</p>
          </button>
        ))}
      </div>
      <section aria-labelledby="difficulty-heading">
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
