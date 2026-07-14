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
  marketStatus?: string;
};

function displayLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function HockeyCard({ card, player, selected, used, compact, status, marketStatus, className = "", disabled, onClick, ...props }: HockeyCardProps) {
  const cardTypeLabel = displayLabel(card.cardType);
  const setLabel = displayLabel(card.setId);
  const classes = [
    styles.card,
    onClick ? styles.interactive : "",
    selected ? styles.selected : "",
    used ? styles.used : "",
    compact ? styles.compact : "",
    status || marketStatus ? styles.hasStatus : "",
    disabled ? styles.disabled : "",
    className,
  ].filter(Boolean).join(" ");

  const accessibleName = [
    player.name,
    `${card.overall} overall`,
    `${cardTypeLabel} card`,
    `${setLabel} set`,
    player.team,
    player.primaryPosition,
    player.league,
    status,
    marketStatus,
  ].filter(Boolean).join(", ");
  const content = (
    <>
      <span className={styles.topline}>
        <span className={styles.overall}>{card.overall}<small>OVR</small></span>
        <span className={styles.league}>{player.league}</span>
      </span>
      <span className={styles.position}>{player.primaryPosition}</span>
      <span className={styles.silhouette} aria-hidden="true" />
      <span className={styles.content}>
        <span className={styles.cardMeta}>
          <span className={styles.cardType}>{cardTypeLabel}</span>
          <span className={styles.set}>{setLabel}</span>
        </span>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.team}>{player.team}{player.nationality ? ` · ${player.nationality}` : ""}</span>
      </span>
      {status || marketStatus ? (
        <span className={styles.status}>
          {status ? <span>{status}</span> : null}
          {marketStatus ? <small>{marketStatus}</small> : null}
        </span>
      ) : null}
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
