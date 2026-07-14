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
  goals?: GoalsSummaryViewModel;
}

function compactProgress(objective: ObjectiveViewModel): string {
  return `${Math.max(0, Math.min(objective.progress, objective.target))}/${objective.target}`;
}

export function HomeScreen({ credits, uniqueCards, collectionScore, completedMatches, goals }: HomeScreenProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Your collection. Your rivalry.</p>
          <h1 className={styles.heroTitle}>Own the <span>ice.</span></h1>
          <p className={styles.heroCopy}>
            Build across two leagues or defend one crest. Every card has a role, every choice shapes the matchup.
          </p>
          <div className={styles.heroActions}>
            <Button onClick={() => navigate("/play")}>Play a faceoff</Button>
            <Button variant="secondary" onClick={() => navigate("/collection")}>View collection</Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="progress-heading">
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

      {goals ? (
        <section aria-labelledby="goals-summary-heading">
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
      ) : null}

      <section className={styles.panel}>
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
  );
}
