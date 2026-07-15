import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../shared/Button";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import type { GoalsSummaryViewModel, ObjectiveViewModel } from "../objectives/viewModels";
import styles from "./HomeScreen.module.css";

export interface HomeScreenProps {
  credits: number;
  uniqueCards: number;
  collectionScore: number;
  completedMatches: number;
  seasonXp?: number;
  goals?: GoalsSummaryViewModel;
}

function compactProgress(objective: ObjectiveViewModel): string {
  return `${Math.max(0, Math.min(objective.progress, objective.target))}/${objective.target}`;
}

export function HomeScreen({ credits, uniqueCards, collectionScore, completedMatches, seasonXp = 0, goals }: HomeScreenProps) {
  const navigate = useNavigate();
  const level = Math.max(1, Math.floor(seasonXp / 1_000) + 1);
  const levelProgress = seasonXp % 1_000;
  const progressPercent = levelProgress / 10;

  return (
    <div className={styles.page}>
      <div className={styles.heroGrid}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>Your collection. Your rivalry.</p>
            <h1 id="home-title" className={styles.heroTitle}>Own the <span>ice.</span></h1>
            <p className={styles.heroCopy}>
              Build across two leagues or defend one crest.<br />Every card has a role, every choice shapes the matchup.
            </p>
            <div className={styles.heroActions}>
              <Button onClick={() => navigate("/play")}>Choose game mode <span aria-hidden="true">→</span></Button>
              <Button variant="secondary" onClick={() => navigate("/collection")}>View collection</Button>
              <Button className={styles.liveShortcut} variant="ghost" onClick={() => navigate("/ghost")}>
                Live Ghost Challenge <span aria-hidden="true">●</span>
              </Button>
            </div>
          </div>
        </section>

        <aside className={styles.ghostPromo} aria-labelledby="ghost-promo-title">
          <div className={styles.ghostCopy}>
            <p className={styles.liveLabel}>Live now</p>
            <h2 id="ghost-promo-title">Ghost Challenge</h2>
            <p>Create or enter a 6-character code. Both players lock hidden choices simultaneously. Pure rivalry, zero rewards.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/ghost")}>Open Live Rooms <span aria-hidden="true">→</span></Button>
        </aside>
      </div>

      <div className={styles.progressGrid}>
        <section className={styles.reportPanel} aria-labelledby="progress-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>Club progress</p>
              <h2 id="progress-heading">Rivalry report</h2>
            </div>
            <p className={styles.syncState}>Synced securely with your account <span aria-hidden="true">♢</span></p>
          </div>
          <div className={styles.statGrid}>
            <div className={styles.stat}><small>Rivalry Points</small><strong>{formatRivalryPoints(credits)}</strong><i aria-hidden="true">R</i></div>
            <div className={styles.stat}><small>Unique cards</small><strong>{uniqueCards}</strong><i aria-hidden="true">◇</i></div>
            <div className={styles.stat}><small>Collection score</small><strong>{collectionScore.toLocaleString("en-US")}</strong><i aria-hidden="true">☆</i></div>
          </div>
        </section>

        <aside className={styles.levelPanel} aria-label={`Club level ${level}`}>
          <span className={styles.levelRing} style={{ "--level-progress": `${progressPercent * 3.6}deg` } as CSSProperties}><b>{level}</b></span>
          <div className={styles.levelCopy}>
            <strong>{levelProgress.toLocaleString("en-US")} / 1,000 EP</strong>
            <span className={styles.progressTrack}><i style={{ width: `${progressPercent}%` }} /></span>
            <small>Next level {level + 1}</small>
          </div>
        </aside>
      </div>

      {goals ? (
        <div className={styles.lowerGrid}>
          <section className={styles.goalsPanel} aria-labelledby="goals-summary-heading">
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>Goals</p>
                <h2 id="goals-summary-heading">Today&apos;s assignments</h2>
              </div>
              <Button className={styles.compactButton} variant="ghost" onClick={() => navigate("/objectives")}>View all goals <span aria-hidden="true">→</span></Button>
            </div>
            <div className={styles.goalGrid}>
              {goals.dailyObjectives.map((objective) => (
                <article key={objective.id} className={`${styles.goal} ${objective.completed ? styles.goalCompleted : ""}`}>
                  <span className={styles.goalState}><i aria-hidden="true">{objective.completed ? "✓" : ""}</i>{objective.completed ? "Done" : compactProgress(objective)}</span>
                  <h3>{objective.title}</h3>
                  <strong>{objective.completed ? "Reward added" : `+${formatRivalryPoints(objective.rewardCredits)}`}</strong>
                </article>
              ))}
            </div>
            <div className={styles.goalSummaryStrip}>
              <div>
                <span>Weekly tour</span>
                <strong>{compactProgress(goals.weeklyObjective)} matches</strong>
                <i aria-hidden="true" style={{ width: `${Math.min(100, goals.weeklyObjective.progress / Math.max(1, goals.weeklyObjective.target) * 100)}%` }} />
              </div>
              <div>
                <span>Rivalry Road</span>
                <strong>{goals.nextRivalryStep?.title ?? "Road complete"}</strong>
                <b aria-hidden="true">RR</b>
              </div>
            </div>
          </section>

          <section className={styles.nextShift} aria-labelledby="next-shift-title">
            <div>
              <p className={styles.eyebrow}>Next shift</p>
              <h2 id="next-shift-title">{completedMatches === 0 ? "Make your debut" : "Keep building momentum"}</h2>
              <p>{completedMatches === 0 ? "Choose a circuit and learn the five-round rivalry format." : `${completedMatches} matches completed. Your next reward is waiting.`}</p>
            </div>
            <Button onClick={() => navigate("/play")}>Choose mode <span aria-hidden="true">→</span></Button>
          </section>
        </div>
      ) : (
        <section className={`${styles.nextShift} ${styles.nextShiftWide}`} aria-labelledby="next-shift-title">
          <div><p className={styles.eyebrow}>Next shift</p><h2 id="next-shift-title">Make your debut</h2><p>Choose a circuit and learn the five-round rivalry format.</p></div>
          <Button onClick={() => navigate("/play")}>Choose mode <span aria-hidden="true">→</span></Button>
        </section>
      )}
    </div>
  );
}
