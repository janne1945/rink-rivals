import { useNavigate } from "react-router-dom";
import { Button } from "../../shared/Button";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import styles from "../Screens.module.css";
import type { GoalsSummaryViewModel, ObjectiveViewModel } from "../objectives/viewModels";

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

  return (
    <div className={`${styles.page} ${styles.homePage}`}>
      <div className={styles.homeHeroGrid}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Your collection. Your rivalry.</p>
          <h1 className={styles.heroTitle}>Own the <span>ice.</span></h1>
          <p className={styles.heroCopy}>
            Build across two leagues or defend one crest. Every card has a role, every choice shapes the matchup.
          </p>
          <div className={styles.heroActions}>
            <Button onClick={() => navigate("/play")}>Choose game mode</Button>
            <Button variant="secondary" onClick={() => navigate("/collection")}>View collection</Button>
            <Button variant="ghost" onClick={() => navigate("/ghost")}>Live Ghost Challenge</Button>
          </div>
        </div>
      </section>

      <aside className={styles.ghostPromo}>
        <div>
          <p className={styles.liveLabel}>Live now</p>
          <h2>Ghost Challenge</h2>
          <p>Create or enter a 6-character code. Both players lock hidden choices simultaneously. Pure rivalry, zero rewards.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/ghost")}>Open Live rooms</Button>
      </aside>
      </div>

      <div className={styles.homeMiddleGrid}>
      <section className={styles.reportPanel} aria-labelledby="progress-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Club progress</p>
            <h2 id="progress-heading">Rivalry report</h2>
          </div>
          <p>Synced securely with your account</p>
        </div>
        <div className={styles.statGrid}>
          <div className={styles.stat}><small>Rivalry Points</small><strong>{formatRivalryPoints(credits)}</strong></div>
          <div className={styles.stat}><small>Unique cards</small><strong>{uniqueCards}</strong></div>
          <div className={styles.stat}><small>Collection score</small><strong>{collectionScore}</strong></div>
        </div>
      </section>

      <aside className={styles.levelPanel} aria-label="Club level">
        <span className={styles.levelRing}>{level}</span>
        <div><strong>{levelProgress.toLocaleString("en-US")} / 1,000 EP</strong><span><i style={{ width: `${levelProgress / 10}%` }} /></span><small>Next level {level + 1}</small></div>
      </aside>
      </div>

      {goals ? (
        <div className={styles.homeLowerGrid}>
        <section className={styles.goalsPanel} aria-labelledby="goals-summary-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Goals</p>
              <h2 id="goals-summary-heading">Today&apos;s assignments</h2>
            </div>
            <Button variant="ghost" onClick={() => navigate("/objectives")}>View all goals</Button>
          </div>
          <div className={styles.homeGoalGrid}>
            {goals.dailyObjectives.map((objective) => (
              <article key={objective.id} className={`${styles.homeGoal} ${objective.completed ? styles.goalCompleted : ""}`}>
                <span className={styles.goalState}>{objective.completed ? "Done" : compactProgress(objective)}</span>
                <h3>{objective.title}</h3>
                <strong>{objective.completed ? "Reward added" : `+${formatRivalryPoints(objective.rewardCredits)}`}</strong>
              </article>
            ))}
          </div>
          <div className={styles.goalSummaryStrip}>
            <div>
              <span>Weekly tour</span>
              <strong>{compactProgress(goals.weeklyObjective)} matches</strong>
            </div>
            <div>
              <span>Rivalry Road</span>
              <strong>{goals.nextRivalryStep?.title ?? "Road complete"}</strong>
            </div>
          </div>
        </section>
      <section className={styles.nextShift}>
        <p className={styles.eyebrow}>Next shift</p>
        <div className={styles.sectionHead}>
          <div>
            <h2>{completedMatches === 0 ? "Make your debut" : "Keep building momentum"}</h2>
            <p>{completedMatches === 0 ? "Choose a circuit and learn the five-round rivalry format." : `${completedMatches} matches completed. Your next reward is waiting.`}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/play")}>Choose mode</Button>
        </div>
      </section>
        </div>
      ) : (
        <section className={styles.nextShift}>
          <p className={styles.eyebrow}>Next shift</p>
          <div className={styles.sectionHead}><div><h2>Make your debut</h2><p>Choose a circuit and learn the five-round rivalry format.</p></div><Button variant="secondary" onClick={() => navigate("/play")}>Choose mode</Button></div>
        </section>
      )}
    </div>
  );
}
