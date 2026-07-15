import { useState } from "react";
import { MATCH_REWARDS, type AiDifficulty } from "../../domain/battle";
import type { GameMode, Lineup } from "../../domain/lineups";
import { AI_TIER_THRESHOLDS } from "../../domain/progression";
import { Button } from "../../shared/Button";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import styles from "./PlayScreen.module.css";

const modes: Array<{ id: GameMode; label: string; kicker: string; copy: string; crest: string }> = [
  { id: "nhl-circuit", label: "NHL Circuit", kicker: "NHL cards only", copy: "Take on six-card NHL lineups in a pure circuit matchup.", crest: "NHL" },
  { id: "pwhl-circuit", label: "PWHL Circuit", kicker: "PWHL cards only", copy: "Build around PWHL stars and compete in a dedicated circuit.", crest: "PWHL" },
  { id: "open-ice", label: "Open Ice", kicker: "NHL and PWHL cards", copy: "Mix both leagues freely. No penalty, only the right card for the moment.", crest: "★" },
];

const difficultyCopy: Readonly<Record<AiDifficulty, { label: string; copy: string; glyph: string }>> = {
  rookie: { label: "Rookie", copy: "A forgiving rival that explores more possible plays.", glyph: "×" },
  pro: { label: "Pro", copy: "A sharper opponent that prefers strong situational choices.", glyph: "★" },
  elite: { label: "Elite", copy: "The toughest read, saving its best answers for the right shift.", glyph: "♠" },
};

const difficulties = AI_TIER_THRESHOLDS.map((threshold) => ({ ...threshold, ...difficultyCopy[threshold.id] }));

export interface PlaySeasonProgress {
  readonly xp: number;
  readonly unlockedRewards: number;
  readonly totalRewards: number;
  readonly maxXp: number;
}

export interface PlayScreenProps {
  readonly lineups: readonly Lineup[];
  readonly activeLineupIds: Record<string, string>;
  readonly collectionScore?: number;
  readonly preferredDifficulty?: AiDifficulty;
  readonly seasonProgress?: PlaySeasonProgress;
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
  seasonProgress = { xp: 0, unlockedRewards: 0, totalRewards: 30, maxXp: 3_000 },
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
  const selectedMode = modes.find((mode) => mode.id === selected) ?? modes[0];
  const selectedDifficulty = difficulties.find((option) => option.id === difficulty) ?? difficulties[0];
  const difficultyUnlocked = collectionScore >= selectedDifficulty.minimumCollectionScore;
  const rewards = MATCH_REWARDS[difficulty];
  const seasonPercent = Math.min(100, Math.max(0, seasonProgress.xp / Math.max(1, seasonProgress.maxXp) * 100));

  function chooseDifficulty(nextDifficulty: AiDifficulty, minimumCollectionScore: number) {
    if (collectionScore < minimumCollectionScore) return;
    setDifficulty(nextDifficulty);
    onDifficultyChange?.(nextDifficulty);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topStage}>
        <header className={styles.intro}>
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}>Three ways to compete</p>
            <h1>Play</h1>
            <p>Jump into real hockey action. Compete online, challenge rival clubs, or test your skills alone.</p>
          </div>
        </header>

        <div className={styles.competitionGrid}>
          <section className={`${styles.competitionCard} ${styles.faceoffCard}`} aria-labelledby="faceoff-title">
            <div className={styles.modeNumber}><span aria-hidden="true">●</span><b>01</b></div>
            <div className={styles.modeCopy}>
              <small>Solo</small>
              <h2 id="faceoff-title">Faceoff</h2>
              <p>Play five head-to-head rounds against the AI. Earn Credits, goals, and Season XP.</p>
            </div>
            <a className={styles.modeAction} href="#faceoff-setup">Configure Faceoff <span aria-hidden="true">→</span></a>
          </section>

          <section className={`${styles.competitionCard} ${styles.arenaCard}`} aria-labelledby="arena-title">
            <div className={styles.modeNumber}><span aria-hidden="true">×</span><b>02</b></div>
            <div className={styles.modeCopy}>
              <small>Real lineup</small>
              <h2 id="arena-title">Rivalry Arena</h2>
              <p>The server finds the closest valid active lineup from another club and controls it. No ranking or divisions.</p>
            </div>
            <span className={styles.versus} aria-hidden="true">VS</span>
            <Button disabled={!active || starting} onClick={() => void onStartArena(selected)}>{starting ? "Finding rival…" : "Enter Arena"}</Button>
          </section>

          <section className={`${styles.competitionCard} ${styles.liveCard}`} aria-labelledby="ghost-title">
            <div className={styles.modeNumber}><span aria-hidden="true">◉</span><b>03</b></div>
            <div className={styles.modeCopy}>
              <small>Two players</small>
              <h2 id="ghost-title">Ghost Challenge</h2>
              <p>Create or enter a six-character code. Both players lock hidden choices simultaneously. Pure rivalry, zero rewards.</p>
            </div>
            <Button variant="secondary" onClick={onOpenLive}>Open Live Rooms <span aria-hidden="true">→</span></Button>
          </section>
        </div>
      </div>

      <button type="button" className={styles.seasonCallout} onClick={onOpenSeason}>
        <span className={styles.seasonCrest} aria-hidden="true">RR</span>
        <span className={styles.seasonCopy}><strong>Season Locker</strong><small>{seasonProgress.unlockedRewards} of {seasonProgress.totalRewards} free rewards unlocked</small></span>
        <span className={styles.seasonTrack} role="progressbar" aria-label="Season Locker progress" aria-valuemin={0} aria-valuemax={seasonProgress.maxXp} aria-valuenow={Math.min(seasonProgress.xp, seasonProgress.maxXp)}><i style={{ width: `${seasonPercent}%` }} /></span>
        <b>View progress <span aria-hidden="true">→</span></b>
      </button>

      <section className={styles.circuitGrid} aria-label="Choose a circuit">
        {modes.map((mode) => {
          const activeLineup = lineups.find((lineup) => lineup.id === activeLineupIds[mode.id]);
          const selectedModeCard = selected === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              className={`${styles.circuitCard} ${styles[mode.id.replaceAll("-", "")]} ${selectedModeCard ? styles.circuitSelected : ""}`}
              onClick={() => setSelected(mode.id)}
              aria-pressed={selectedModeCard}
            >
              <span className={styles.circuitCrest} aria-hidden="true">{mode.crest}</span>
              <span className={styles.circuitCopy}>
                <small>{mode.kicker}</small>
                <strong>{mode.label}</strong>
                <p>{mode.copy}</p>
                <em>{activeLineup ? `Active · ${activeLineup.name}` : "Lineup required"}</em>
              </span>
            </button>
          );
        })}
      </section>

      <section id="faceoff-setup" className={styles.difficultySection} aria-labelledby="difficulty-heading">
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
                <span className={styles.difficultyCrest} aria-hidden="true">{option.glyph}</span>
                <span className={styles.difficultyCopy}>
                  <span className={styles.difficultyTopline}><strong>{option.label}</strong><span>{unlocked ? "Unlocked" : "Locked · 🔒"}</span></span>
                  <p>{option.copy}</p>
                  <small>{unlocked ? `Win +${formatRivalryPoints(MATCH_REWARDS[option.id].player)}` : `${scoreNeeded.toLocaleString("en-US")} more Collection Score`}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.matchSetup} aria-labelledby="active-six-heading">
        <div className={styles.matchSetupCopy}>
          <p className={styles.eyebrow}>Active six</p>
          <h2 id="active-six-heading">{active?.name ?? "No valid lineup"}</h2>
          <p>{selectedMode.label} · {selectedDifficulty.label} · five rounds · goalie guaranteed</p>
        </div>
        <div className={styles.rewardSummary}><span>Possible rewards</span><strong>Win +{formatRivalryPoints(rewards.player)} · Draw +{formatRivalryPoints(rewards.tie)} · Loss +{formatRivalryPoints(rewards.opponent)}</strong></div>
        <Button onClick={() => void onStart(selected, difficulty)} disabled={!active || !difficultyUnlocked || starting}>{starting ? "Preparing rival…" : "Start match"}</Button>
        {startError ? <p className={styles.error} role="alert">{startError}</p> : null}
      </section>
    </div>
  );
}
