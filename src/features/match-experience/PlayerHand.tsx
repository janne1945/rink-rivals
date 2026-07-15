import { motion } from "motion/react";

import { calculateCategoryValue, type BattleSituation, type BattleViewState } from "../../domain/battle";
import { HockeyCard } from "../../shared/HockeyCard";
import type { MotionPreset } from "./motionPresets";
import styles from "./MatchExperienceV2.module.css";

export function PlayerHand({ battle, situation, eligibleCardIds, disabled, preset, onSelect }: {
  readonly battle: BattleViewState;
  readonly situation: BattleSituation;
  readonly eligibleCardIds: readonly string[];
  readonly disabled: boolean;
  readonly preset: MotionPreset;
  readonly onSelect: (cardId: string) => void;
}) {
  const eligible = new Set(eligibleCardIds);
  return (
    <section className={styles.handSection} aria-labelledby="v2-hand-heading" data-player-hand>
      <div className={styles.handHeading}>
        <div><span>Club inventory</span><h2 id="v2-hand-heading" tabIndex={-1}>Choose your shift</h2></div>
        <p>Eligible cards show the exact <strong>{situation.name}</strong> value used by the server.</p>
      </div>
      <div className={styles.handRail}>
        {battle.lineups.player.cards.map(({ card, player }, index) => {
          const used = battle.usedCardIds.player.includes(card.id);
          const roleMatches = card.role === situation.role;
          const allowed = eligible.has(card.id) && !disabled;
          const value = roleMatches ? calculateCategoryValue(card, situation) : null;
          const status = used ? "Used in an earlier round" : roleMatches ? allowed ? "Eligible" : `Not eligible for ${situation.name}` : `${situation.role === "goalie" ? "Goalie" : "Skater"} card required`;
          return (
            <motion.div
              key={card.id}
              layoutId={`v2-card-${card.id}`}
              className={styles.handCard}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: preset.duration.commit / 1000, delay: preset.distance === 0 ? 0 : index * 0.035 }}
              whileHover={allowed ? { y: -8, scale: 1.015 } : undefined}
              whileFocus={allowed ? { y: -6 } : undefined}
            >
              <HockeyCard
                card={card}
                player={player}
                used={used}
                disabled={!allowed}
                status={status}
                highlightedStat={value === null ? undefined : { label: situation.name, value }}
                onClick={() => onSelect(card.id)}
              />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
