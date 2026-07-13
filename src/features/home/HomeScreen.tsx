import { useNavigate } from "react-router-dom";
import { Button } from "../../shared/Button";
import styles from "../Screens.module.css";

interface HomeScreenProps {
  credits: number;
  uniqueCards: number;
  collectionScore: number;
  completedMatches: number;
}

export function HomeScreen({ credits, uniqueCards, collectionScore, completedMatches }: HomeScreenProps) {
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
          <p>Saved locally on this device</p>
        </div>
        <div className={styles.statGrid}>
          <div className={styles.stat}><small>Credits</small><strong>{credits.toLocaleString("en-US")}</strong></div>
          <div className={styles.stat}><small>Unique cards</small><strong>{uniqueCards}</strong></div>
          <div className={styles.stat}><small>Collection score</small><strong>{collectionScore}</strong></div>
        </div>
      </section>

      <section className={styles.panel}>
        <p className={styles.eyebrow}>Next shift</p>
        <div className={styles.sectionHead}>
          <div>
            <h2>{completedMatches === 0 ? "Make your debut" : "Keep the streak alive"}</h2>
            <p>{completedMatches === 0 ? "Choose a circuit and learn the five-round rivalry format." : `${completedMatches} matches completed. Your next reward is waiting.`}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/play")}>Choose mode</Button>
        </div>
      </section>
    </div>
  );
}
