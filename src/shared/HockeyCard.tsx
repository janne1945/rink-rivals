import type { ButtonHTMLAttributes } from "react";
import type { CardVersion, Player } from "../domain/cards";
import styles from "./HockeyCard.module.css";

type HockeyCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  card: CardVersion;
  player: Player;
  selected?: boolean;
  used?: boolean;
  compact?: boolean;
  status?: string;
};

export function HockeyCard({ card, player, selected, used, compact, status, className = "", disabled, onClick, ...props }: HockeyCardProps) {
  const classes = [
    styles.card,
    selected ? styles.selected : "",
    used ? styles.used : "",
    compact ? styles.compact : "",
    disabled ? styles.disabled : "",
    className,
  ].filter(Boolean).join(" ");

  const accessibleName = `${player.name}, ${card.overall} overall, ${player.primaryPosition}, ${player.league}`;
  const content = (
    <>
      <span className={styles.topline}>
        <span className={styles.overall}>{card.overall}<small>OVR</small></span>
        <span className={styles.league}>{player.league}</span>
      </span>
      <span className={styles.position}>{player.primaryPosition}</span>
      <span className={styles.silhouette} aria-hidden="true" />
      <span className={styles.content}>
        <span className={styles.set}>{card.cardType === "base" ? "Rink Rivals" : card.setId.replaceAll("-", " ")}</span>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.team}>{player.team} · {player.nationality}</span>
      </span>
      {status ? <span className={styles.status}>{status}</span> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={accessibleName}
        onClick={onClick}
        {...props}
      >
        {content}
      </button>
    );
  }

  return <article className={classes} aria-label={accessibleName}>{content}</article>;
}
