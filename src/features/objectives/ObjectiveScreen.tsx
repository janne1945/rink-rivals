import { useNavigate } from "react-router-dom";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import styles from "../Screens.module.css";
import type {
  ObjectiveViewModel,
  RivalryRewardChoiceViewModel,
  RivalryRoadStepViewModel,
} from "./viewModels";

interface GoalCardProps {
  objective: ObjectiveViewModel;
}

function GoalCard({ objective }: GoalCardProps) {
  const safeTarget = Math.max(1, objective.target);
  const safeProgress = Math.min(Math.max(0, objective.progress), safeTarget);
  const progressLabel = `${safeProgress} of ${objective.target}`;

  return (
    <article className={`${styles.goalCard} ${objective.completed ? styles.goalCompleted : ""}`}>
      <div className={styles.goalCardTop}>
        <span className={styles.goalState}>{objective.completed ? "Completed" : "In progress"}</span>
        <strong className={styles.goalReward}>{objective.completed ? "Claimed" : `+${formatRivalryPoints(objective.rewardCredits)}`}</strong>
      </div>
      <div>
        <h3>{objective.title}</h3>
        <p>{objective.description}</p>
      </div>
      <div className={styles.goalProgressRow}>
        <progress max={safeTarget} value={safeProgress} aria-label={`${objective.title}: ${progressLabel}`} />
        <span>{progressLabel}</span>
      </div>
    </article>
  );
}

export interface ObjectiveScreenProps {
  readonly dailyObjectives: readonly ObjectiveViewModel[];
  readonly dailyPeriodLabel: string;
  readonly weeklyObjective: ObjectiveViewModel;
  readonly weeklyPeriodLabel: string;
  readonly rivalrySteps: readonly RivalryRoadStepViewModel[];
  readonly rewardChoice?: RivalryRewardChoiceViewModel;
  readonly statusMessage?: string;
  readonly onChooseRivalryCard: (cardId: string) => void;
}

export function ObjectiveScreen({
  dailyObjectives,
  dailyPeriodLabel,
  weeklyObjective,
  weeklyPeriodLabel,
  rivalrySteps,
  rewardChoice,
  statusMessage,
  onChooseRivalryCard,
}: ObjectiveScreenProps) {
  const navigate = useNavigate();
  const choiceLocked = Boolean(rewardChoice?.claimedCardId || rewardChoice?.isSubmitting);

  return (
    <div className={styles.page}>
      <header className={styles.goalsHero}>
        <div>
          <p className={styles.eyebrow}>Progression</p>
          <h1 className={styles.title}>Goals hub</h1>
          <p className={styles.lede}>Every matchup moves the club forward. Daily and weekly rewards are added automatically.</p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/")}>Back home</Button>
      </header>

      {statusMessage ? <p className={styles.notice} role="status" aria-live="polite">{statusMessage}</p> : null}

      <section aria-labelledby="daily-goals-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Daily</p>
            <h2 id="daily-goals-heading">Today&apos;s matchups</h2>
          </div>
          <p>{dailyPeriodLabel}</p>
        </div>
        <div className={styles.objectiveGrid}>
          {dailyObjectives.map((objective) => <GoalCard key={objective.id} objective={objective} />)}
        </div>
      </section>

      <section aria-labelledby="weekly-goal-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Weekly</p>
            <h2 id="weekly-goal-heading">Circuit tour</h2>
          </div>
          <p>{weeklyPeriodLabel}</p>
        </div>
        <GoalCard objective={weeklyObjective} />
      </section>

      <section aria-labelledby="rivalry-road-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Permanent challenge</p>
            <h2 id="rivalry-road-heading">Rivalry Road</h2>
          </div>
          <p>Complete each stop in order</p>
        </div>
        <ol className={styles.rivalryRoad}>
          {rivalrySteps.map((step, index) => (
            <li key={step.id} className={`${styles.rivalryStep} ${styles[`rivalryStep${step.status}`]}`}>
              <span className={styles.rivalryIndex} aria-hidden="true">{index + 1}</span>
              <div>
                <span className={styles.goalState}>{step.status}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.rewardLabel}</strong>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {rewardChoice ? (
        <section className={styles.rewardChoice} aria-labelledby="reward-choice-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Rivalry Road finale</p>
              <h2 id="reward-choice-heading">Choose your featured star</h2>
              <p>This decision is permanent. Both 94 OVR cards have equal collection value.</p>
            </div>
          </div>
          <div className={styles.rewardChoiceGrid}>
            {rewardChoice.cards.map(({ card, player }) => {
              const isClaimed = rewardChoice.claimedCardId === card.id;
              return (
                <div className={styles.rewardChoiceCard} key={card.id}>
                  <HockeyCard
                    card={card}
                    player={player}
                    selected={isClaimed}
                    status={isClaimed ? "Selected" : rewardChoice.claimedCardId ? "Unavailable" : undefined}
                  />
                  <Button
                    wide
                    disabled={choiceLocked}
                    aria-label={`Choose ${player.name} as your Rivalry Road reward`}
                    onClick={() => onChooseRivalryCard(card.id)}
                  >
                    {isClaimed ? "Added to collection" : rewardChoice.isSubmitting ? "Adding card…" : `Choose ${player.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
          {rewardChoice.errorMessage ? <p className={styles.error} role="alert">{rewardChoice.errorMessage}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
